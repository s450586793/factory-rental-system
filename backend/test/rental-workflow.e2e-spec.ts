import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import request from "supertest";
import { DataSource } from "typeorm";

// 仅创建和销毁本测试随机命名的数据库，避免测试覆盖现有库。
const databaseName = `rent_test_${process.pid}_${Date.now()}`;
const connection = {
  host: process.env.INTEGRATION_DB_HOST || "127.0.0.1",
  port: Number(process.env.INTEGRATION_DB_PORT || 55439),
  user: process.env.INTEGRATION_DB_USER || "rent_test",
  password: process.env.INTEGRATION_DB_PASSWORD || "rent_local_test",
  database: process.env.INTEGRATION_DB_NAME || "rent_integration",
};
let app: INestApplication | undefined;
let database: DataSource;
let storage: string;
let createdDatabase = false;
let administrator: DataSource;
let session: ReturnType<typeof request.agent>;

async function startApplication() {
  const { AppModule } = await import("../src/app.module");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.init();
  database = app.get(DataSource);
  session = request.agent(app.getHttpServer());
  await session.post("/api/auth/login").send({ username: "integration_admin", password: "integration_only_password" }).expect(201);
}

async function readyDocument(contractId: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await session.get(`/api/contracts/${contractId}/document-status`).expect(200);
    if (response.body.status === "failed") throw new Error(`Document failed: ${response.body.error}`);
    if (response.body.status === "ready") return response.body;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Document did not become ready within 120 seconds");
}

describe("真实数据库租赁业务流程", () => {
  beforeAll(async () => {
    administrator = new DataSource({ type: "postgres", ...connection, username: connection.user });
    await administrator.initialize();
    await administrator.query(`CREATE DATABASE "${databaseName}"`);
    createdDatabase = true;
    storage = await mkdtemp(join(tmpdir(), "rent-workflow-"));
    Object.assign(process.env, {
      NODE_ENV: "test", JWT_SECRET: "integration_only_secret", ADMIN_USERNAME: "integration_admin", ADMIN_PASSWORD: "integration_only_password",
      COOKIE_SECURE: "false", API_DOCS_ENABLED: "false", WEB_UPDATE_ENABLED: "false", WEB_UPDATE_ONLINE_VERSION_URL: "",
      DB_HOST: connection.host, DB_PORT: String(connection.port), DB_USER: connection.user, DB_PASSWORD: connection.password,
      DB_NAME: databaseName, DB_SYNCHRONIZE: "false", STORAGE_ROOT: storage,
    });
    const { buildTypeOrmOptions } = await import("../src/database/typeorm.config");
    const migrationSource = new DataSource(buildTypeOrmOptions({ host: connection.host, port: connection.port, username: connection.user, password: connection.password, database: databaseName, synchronize: false }));
    await migrationSource.initialize();
    try {
      await migrationSource.runMigrations();
      expect(await migrationSource.runMigrations()).toEqual([]);
    } finally {
      await migrationSource.destroy();
    }
    await startApplication();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (createdDatabase) await administrator.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    if (administrator?.isInitialized) await administrator.destroy();
    if (storage) await rm(storage, { recursive: true, force: true });
  });

  it("保存、重新打开、生成下载、凭证预览、收费对账、分页和重启后缓存使用真实接口", async () => {
    const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric" }).format(new Date()));
    const unit = (await session.post("/api/units").send({ code: "TEST-01", location: "集成测试厂房", area: 500 }).expect(201)).body;
    const payload = {
      unitId: unit.id, lessorName: "测试出租方", lessorContactName: "甲方联系人", lessorSafetyManager: "甲方联系人",
      tenantName: "集成测试租户", contactName: "乙方联系人", tenantSafetyManager: "乙方联系人",
      signedDate: `${year}-01-01`, startDate: `${year}-01-01`, endDate: `${year + 1}-12-31`,
      annualRent: 100000, depositAmount: 5000, electricUnitPrice: 0.95, electricLineLossPercent: 5, waterUnitPrice: 3,
      earlyTerminationPenaltyAmount: 5000, billingFrequency: "annual", attachmentFileIds: [],
    };
    const contract = (await session.post("/api/contracts").send(payload).expect(201)).body;
    await session.get("/api/health").timeout(2000).expect(200);
    let detail = (await session.get(`/api/units/${unit.id}`).expect(200)).body;
    expect(detail.contracts[0]).toMatchObject({ depositAmount: 5000, electricUnitPrice: 0.95, tenantSafetyManager: "乙方联系人" });
    await session.patch(`/api/contracts/${contract.id}`).send({ ...payload, depositAmount: 6000 }).expect(200);
    detail = (await session.get(`/api/contracts/${contract.id}`).expect(200)).body;
    expect(detail.depositAmount).toBe(6000);
    const history = (await session.get(`/api/contracts/${contract.id}/history`).expect(200)).body;
    expect(history).toEqual(expect.arrayContaining([expect.objectContaining({ field: "depositAmount", beforeValue: "5000.00", afterValue: "6000.00", actorUsername: "integration_admin" })]));
    await session.patch(`/api/contracts/${contract.id}`).send({ ...payload, depositAmount: 6000 }).expect(200);
    expect((await session.get(`/api/contracts/${contract.id}/history`).expect(200)).body).toHaveLength(history.length);
    await session.patch(`/api/contracts/${contract.id}`).send({ ...payload, depositAmount: -1 }).expect(400);
    expect((await session.get(`/api/contracts/${contract.id}`).expect(200)).body.depositAmount).toBe(6000);

    const documentStatus = await readyDocument(contract.id);
    const pdf = await session.get(`/api/contracts/${contract.id}/generated-document`).expect(200).expect("Content-Type", /application\/pdf/);
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect((await PDFDocument.load(pdf.body)).getPageCount()).toBeGreaterThan(1);
    expect(pdf.headers["content-disposition"]).not.toContain(encodeURIComponent("自动生成"));
    const attemptsBefore = documentStatus.attempts;
    await app!.close();
    app = undefined;
    await startApplication();
    const cached = await session.get(`/api/contracts/${contract.id}/generated-document`).expect(200);
    expect(cached.body.equals(pdf.body)).toBe(true);
    expect((await session.get(`/api/contracts/${contract.id}/document-status`).expect(200)).body.attempts).toBe(attemptsBefore);

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1sAAAAASUVORK5CYII=", "base64");
    const uploaded = (await session.post("/api/files/upload").field("category", "payment-voucher").attach("files", png, { filename: "receipt.png", contentType: "image/png" }).expect(201)).body;
    const payment = (await session.post("/api/rent-payments").send({ contractId: contract.id, paymentDate: `${year}-01-05`, amount: 25000, method: "转账", attachmentFileIds: [uploaded[0].id] }).expect(201)).body;
    expect(payment.allocations[0].allocatedAmount).toBe(25000);
    const preview = await session.get(`/api/files/${uploaded[0].id}/download`).expect(200).expect("Content-Type", /image\/png/);
    expect(preview.body.equals(png)).toBe(true);
    const ledger = (await session.get("/api/rent-reconciliation/detail").query({ tenantName: payload.tenantName }).expect(200)).body;
    expect(ledger).toMatchObject({ dueReceivableAmount: 100000, duePaidAmount: 25000, outstandingAmount: 75000 });
    await session.post("/api/units").send({ code: "TEST-02", location: "空置厂房", area: 200 }).expect(201);
    const page1 = (await session.get("/api/units/page").query({ page: 1, pageSize: 1 }).expect(200)).body;
    const page2 = (await session.get("/api/units/page").query({ page: 2, pageSize: 1 }).expect(200)).body;
    expect(page1.total).toBe(2);
    expect(page1.stats).toEqual(page2.stats);
    expect(page1.items[0]).toMatchObject({ id: unit.id, outstandingAmount: 75000, contractCount: 1 });
    expect(page1.items[0]).not.toHaveProperty("contracts");
    expect(page2.items[0].outstandingAmount).toBe(0);
    await session.get("/api/units/page").query({ page: 0, pageSize: 1 }).expect(400);
    await request(app!.getHttpServer()).get(`/api/contracts/${contract.id}/history`).expect(401);
    await request(app!.getHttpServer()).get(`/api/contracts/${contract.id}/document-status`).expect(401);

    // 实际验证软删除的分配、收款和期次不会进入分页欠费汇总。
    await database.query('UPDATE rent_payment_allocations SET "deletedAt" = now() WHERE "rentPaymentId" = $1', [payment.payment.id]);
    expect((await session.get("/api/units/page").query({ page: 1, pageSize: 1 }).expect(200)).body.items[0].outstandingAmount).toBe(100000);
    await database.query('UPDATE rent_receivable_schedules SET "deletedAt" = now() WHERE "contractId" = $1', [contract.id]);
    expect((await session.get("/api/units/page").query({ page: 1, pageSize: 1 }).expect(200)).body.items[0].outstandingAmount).toBe(0);
  });
});
