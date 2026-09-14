import {
  ContractDocumentQueueService,
  CONTRACT_DOCUMENT_WAIT_MS,
} from "./contract-document-queue.service";
import { ContractDocumentJob } from "./contract-document-job.entity";
import { Contract } from "./contract.entity";
import { FactoryUnit } from "../units/factory-unit.entity";
import { buildDocumentRevision } from "./contract-document-revision";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const contract = {
    id: "contract-1",
    unitId: "unit-1",
    tenantName: "测试租户",
    annualRent: 50000,
    depositAmount: 5000,
    electricUnitPrice: 0.95,
    electricLineLossPercent: 5,
    waterUnitPrice: 1,
    earlyTerminationPenaltyAmount: 4166.67,
    startDate: "2026-09-01",
    endDate: "2027-08-31",
  } as Contract;
  const unit = {
    id: "unit-1",
    code: "1",
    location: "厂房",
    area: 500,
    meterConfigs: [],
  } as unknown as FactoryUnit;
  const rows = new Map<string, ContractDocumentJob>();
  const cache = new Map<string, Buffer>();
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const matches = (row: ContractDocumentJob, where: Record<string, unknown>) =>
    Object.entries(where).every(
      ([key, value]) => row[key as keyof ContractDocumentJob] === value,
    );
  const jobs = {
    findOne: jest.fn(async ({ where }) => {
      const row = [...rows.values()].find((item) => matches(item, where));
      return row ? copy(row) : null;
    }),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => {
      const saved = { ...value, updatedAt: new Date() };
      rows.set(value.contractId, copy(saved));
      return saved;
    }),
    update: jest.fn(async (where, changes) => {
      let affected = 0;
      for (const [id, row] of rows) {
        if (matches(row, where)) {
          rows.set(id, { ...row, ...changes });
          affected += 1;
        }
      }
      return { affected };
    }),
  };
  const contracts = { findOne: jest.fn(async () => copy(contract)) };
  const units = { findOne: jest.fn(async () => copy(unit)) };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === ContractDocumentJob) return jobs;
      if (entity === Contract) return contracts;
      if (entity === FactoryUnit) return units;
      throw new Error("Unexpected entity");
    }),
  };
  const dataSource = {
    ...manager,
    transaction: jest.fn(async (callback) => callback(manager)),
  };
  const files = {
    readGeneratedContractDocument: jest.fn(
      async (id, revision) => cache.get(`${id}:${revision}`) ?? null,
    ),
    saveGeneratedContractDocument: jest.fn(async (id, revision, buffer) => {
      cache.set(`${id}:${revision}`, buffer);
    }),
  };
  const renderer = {
    render: jest.fn(async (): Promise<Buffer> => Buffer.from("%PDF")),
    onModuleDestroy: jest.fn(),
  };
  const queue = new ContractDocumentQueueService(
    dataSource as never,
    files as never,
    renderer as never,
  );
  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await new Promise(setImmediate);
  };
  return {
    queue,
    contract,
    unit,
    rows,
    jobs,
    manager,
    dataSource,
    files,
    renderer,
    cache,
    contracts,
    flush,
  };
}

describe("ContractDocumentQueueService", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("persists work before kick, deduplicates requests and publishes a cached PDF", async () => {
    const f = fixture();
    const job = await f.queue.enqueue(f.manager as never, f.contract, f.unit);
    expect(job.status).toBe("pending");
    expect(f.renderer.render).not.toHaveBeenCalled();
    await f.queue.enqueue(f.manager as never, f.contract, f.unit);
    expect(f.jobs.save).toHaveBeenCalledTimes(1);
    f.queue.kick();
    f.queue.kick();
    await f.flush();
    expect(f.renderer.render).toHaveBeenCalledTimes(1);
    expect(await f.queue.status(f.contract.id)).toMatchObject({
      status: "ready",
      attempts: 1,
      error: null,
    });
    expect((await f.queue.generate(f.contract.id)).buffer).toEqual(
      Buffer.from("%PDF"),
    );
    await f.flush();
    expect(f.renderer.render).toHaveBeenCalledTimes(1);
  });

  it("runs at most one render at a time and discards obsolete output before cache cleanup", async () => {
    const f = fixture();
    const first = deferred<Buffer>();
    f.renderer.render.mockReturnValueOnce(first.promise);
    await f.queue.enqueue(f.manager as never, f.contract, f.unit);
    f.queue.kick();
    await f.flush();
    f.contract.annualRent = 60000;
    const latest = await f.queue.enqueue(
      f.manager as never,
      f.contract,
      f.unit,
    );
    await f.queue.enqueue(
      f.manager as never,
      { ...f.contract, id: "contract-2" },
      f.unit,
    );
    f.queue.kick();
    await f.flush();
    expect(f.renderer.render).toHaveBeenCalledTimes(1);
    first.resolve(Buffer.from("obsolete"));
    await f.flush();
    expect(f.renderer.render).toHaveBeenCalledTimes(3);
    expect(f.files.saveGeneratedContractDocument).toHaveBeenCalledTimes(2);
    expect(f.files.saveGeneratedContractDocument).toHaveBeenCalledWith(
      f.contract.id,
      latest.revision,
      Buffer.from("%PDF"),
    );
    expect(
      f.files.saveGeneratedContractDocument.mock.calls.some((call) =>
        call[2].equals(Buffer.from("obsolete")),
      ),
    ).toBe(false);
  });

  it("records a safe failure and retries the same revision without resetting attempts", async () => {
    const f = fixture();
    f.renderer.render.mockRejectedValueOnce(
      new Error("secret=/private/font.ttf token=hidden"),
    );
    await f.queue.status(f.contract.id);
    await f.flush();
    const failed = await f.queue.status(f.contract.id);
    expect(failed).toMatchObject({
      status: "failed",
      attempts: 1,
      error: "合同 PDF 生成失败，请重试",
    });
    await expect(f.queue.generate(f.contract.id)).rejects.toMatchObject({
      response: { code: "CONTRACT_DOCUMENT_FAILED" },
    });
    await f.flush();
    expect(f.renderer.render).toHaveBeenCalledTimes(1);
    expect(await f.queue.status(f.contract.id, true)).toMatchObject({
      status: "pending",
      attempts: 1,
      error: null,
    });
    await f.flush();
    expect(await f.queue.status(f.contract.id)).toMatchObject({
      status: "ready",
      attempts: 2,
    });
    await f.flush();
  });

  it("recovers interrupted and pending jobs after restart", async () => {
    const f = fixture();
    const job = await f.queue.enqueue(f.manager as never, f.contract, f.unit);
    f.rows.set(job.contractId, { ...job, status: "processing", attempts: 1 });
    await f.queue.enqueue(
      f.manager as never,
      { ...f.contract, id: "contract-2" },
      f.unit,
    );
    await f.queue.onModuleInit();
    await f.flush();
    expect([...f.rows.values()].map((row) => row.status)).toEqual([
      "ready",
      "ready",
    ]);
    expect(f.rows.get(job.contractId)?.attempts).toBe(2);
    f.queue.onModuleDestroy();
  });

  it("rebuilds a ready job when the cache file was lost", async () => {
    const f = fixture();
    await f.queue.status(f.contract.id);
    await f.flush();
    f.cache.clear();
    expect(await f.queue.status(f.contract.id)).toMatchObject({
      status: "pending",
    });
    await f.flush();
    expect(f.renderer.render).toHaveBeenCalledTimes(2);
  });

  it("automatically recovers when publishing and recording failure both lose the database connection", async () => {
    jest.useFakeTimers();
    const f = fixture();
    let disconnected = false;
    const update = f.jobs.update.getMockImplementation()!;
    const transaction = f.dataSource.transaction.getMockImplementation()!;
    f.jobs.update.mockImplementation(async (where, changes) => {
      if (disconnected) throw new Error("database disconnected");
      return update(where, changes);
    });
    f.dataSource.transaction.mockImplementation(async (callback) => {
      if (disconnected) throw new Error("database disconnected");
      return transaction(callback);
    });
    f.renderer.render.mockImplementationOnce(async () => {
      disconnected = true;
      return Buffer.from("%PDF");
    });
    await f.queue.enqueue(f.manager as never, f.contract, f.unit);
    f.queue.onModuleInit();

    try {
      await jest.advanceTimersByTimeAsync(0);
      expect(f.rows.get(f.contract.id)).toMatchObject({
        status: "processing",
        attempts: 1,
      });
      expect(f.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(f.jobs.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "processing",
          contractId: f.contract.id,
        }),
        expect.objectContaining({ status: "failed" }),
      );
      expect(f.files.saveGeneratedContractDocument).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(2_001);
      expect(f.rows.get(f.contract.id)?.status).toBe("processing");
      expect(f.renderer.render).toHaveBeenCalledTimes(1);
      expect(f.jobs.update).toHaveBeenLastCalledWith(
        { status: "processing" },
        { status: "pending", error: null },
      );

      disconnected = false;
      await jest.advanceTimersByTimeAsync(2_000);
      expect(f.rows.get(f.contract.id)).toMatchObject({
        status: "ready",
        attempts: 2,
        error: null,
      });
      expect(f.renderer.render).toHaveBeenCalledTimes(2);
      expect(f.files.saveGeneratedContractDocument).toHaveBeenCalledTimes(1);
    } finally {
      f.queue.onModuleDestroy();
    }
  });

  it("does not rebuild when unrelated meter configuration or numeric representation changes", async () => {
    const f = fixture();
    const revision = buildDocumentRevision(f.contract, f.unit);
    f.unit.meterConfigs = [{ id: "meter-1", unitPrice: 999 }] as never;
    f.contract.annualRent = "50000.00" as never;
    expect(buildDocumentRevision(f.contract, f.unit)).toBe(revision);
    f.contract.electricUnitPrice = 1;
    expect(buildDocumentRevision(f.contract, f.unit)).not.toBe(revision);
  });

  it("bounds compatibility download waiting and leaves the durable job pending", async () => {
    jest.useFakeTimers();
    const f = fixture();
    jest.spyOn(f.queue, "kick").mockImplementation(() => undefined);
    const result = f.queue.generate(f.contract.id);
    const assertion = expect(result).rejects.toMatchObject({
      response: { code: "CONTRACT_DOCUMENT_PENDING", status: "pending" },
    });
    await jest.advanceTimersByTimeAsync(CONTRACT_DOCUMENT_WAIT_MS + 250);
    await assertion;
    expect(f.rows.get(f.contract.id)?.status).toBe("pending");
  });

  it("does not enqueue a deleted or missing contract", async () => {
    const f = fixture();
    f.contracts.findOne.mockResolvedValueOnce(null as never);
    await expect(f.queue.status(f.contract.id)).rejects.toThrow("合同不存在");
    expect(f.jobs.save).not.toHaveBeenCalled();
  });
});
