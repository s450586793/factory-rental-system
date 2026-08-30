import { BillingFrequency, DepositSettlementMode } from "./contract.enums";
import { buildContractDocumentPdf } from "./contract-document";
import { Contract, ContractStatus } from "./contract.entity";
import { ContractsService } from "./contracts.service";

jest.mock("./contract-document", () => ({
  ...jest.requireActual("./contract-document"),
  buildContractDocumentPdf: jest.fn(),
}));

function existingContract(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-1",
    unitId: "unit-1",
    lessorName: "原甲方",
    lessorLicenseCode: "original-lessor-license",
    lessorContactName: "原联系人",
    lessorPhone: "12345678900",
    lessorSafetyManager: "原甲方安全负责人",
    tenantName: "测试租户有限公司",
    contactName: "原负责人",
    tenantPhone: "12345678901",
    licenseCode: "original-tenant-license",
    tenantSafetyManager: "原乙方安全负责人",
    signedDate: "2026-08-28",
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    annualRent: 50000,
    depositAmount: 10000,
    electricUnitPrice: 0.88,
    electricLineLossPercent: 3,
    waterUnitPrice: 1.2,
    earlyTerminationPenaltyAmount: 4166.67,
    billingFrequency: BillingFrequency.SEMIANNUAL,
    depositSettlementMode: DepositSettlementMode.CARRYOVER,
    depositCarryoverAmount: 8000,
    depositCarryoverSourceContractId: "source-contract",
    status: ContractStatus.FUTURE,
    ...overrides,
  };
}

function buildService(
  options: {
    existingContract?: Record<string, unknown>;
    depositAccount?: Record<string, unknown> | null;
    cachedGeneratedDocument?: Buffer | null;
  } = {},
) {
  let savedContract: Record<string, unknown> | null = null;
  const contractsRepository = {
    findOne: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(options.existingContract ?? savedContract),
      ),
    find: jest
      .fn()
      .mockResolvedValue(
        options.existingContract ? [options.existingContract] : [],
      ),
    create: jest.fn().mockImplementation((value) => value),
    save: jest.fn().mockImplementation((value) => {
      savedContract = {
        ...value,
        id: (value as Record<string, unknown>).id ?? "contract-new",
      };
      return Promise.resolve(savedContract);
    }),
    findOneOrFail: jest
      .fn()
      .mockImplementation(() => Promise.resolve(savedContract)),
  };
  const unitsRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: "unit-1",
      code: "1",
      location: "测试厂房",
      area: 500,
      meterConfigs: [],
    }),
  };
  const filesService = {
    findOneOrFail: jest.fn(),
    findByIds: jest.fn(),
    readGeneratedContractDocument: jest
      .fn()
      .mockResolvedValue(options.cachedGeneratedDocument ?? null),
    saveGeneratedContractDocument: jest.fn().mockResolvedValue(undefined),
    removeGeneratedContractDocuments: jest.fn().mockResolvedValue(undefined),
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === Contract) {
        return contractsRepository;
      }
      throw new Error(`Unexpected repository: ${entity.name}`);
    }),
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation((callback) => callback(manager)),
  };
  const receivablesService = {
    syncContractSchedules: jest.fn().mockResolvedValue(undefined),
  };
  const depositsService = {
    getAccount: jest.fn().mockResolvedValue(options.depositAccount ?? null),
  };
  const ServiceWithMocks = ContractsService as unknown as new (
    contractsRepository: unknown,
    unitsRepository: unknown,
    filesService: unknown,
    dataSource: unknown,
    receivablesService: unknown,
    depositsService: unknown,
  ) => ContractsService;

  return {
    service: new ServiceWithMocks(
      contractsRepository,
      unitsRepository,
      filesService,
      dataSource,
      receivablesService,
      depositsService,
    ),
    contractsRepository,
    dataSource,
    depositsService,
    filesService,
    manager,
    receivablesService,
  };
}

function buildDto(overrides: Record<string, unknown> = {}) {
  return {
    unitId: "unit-1",
    lessorName: "  江阴市示例产业园有限公司  ",
    lessorLicenseCode: "  91320281TEST000001  ",
    lessorContactName: "  吴孝斌  ",
    lessorPhone: "  18651510352  ",
    lessorSafetyManager: "  吴孝斌  ",
    tenantName: "  测试租户有限公司  ",
    contactName: "  张三  ",
    tenantPhone: "  13800000000  ",
    licenseCode: "  91320281TEST000002  ",
    tenantSafetyManager: "  张三  ",
    signedDate: "2026-08-28",
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    annualRent: 50000,
    depositAmount: 5000,
    electricUnitPrice: 0.95,
    electricLineLossPercent: 5,
    waterUnitPrice: 1,
    earlyTerminationPenaltyAmount: 4166.67,
    ...overrides,
  };
}

describe("ContractsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(buildContractDocumentPdf)
      .mockResolvedValue(Buffer.from("generated-pdf"));
  });

  it("saves a normalized contract and generated schedules in one transaction", async () => {
    const {
      service,
      contractsRepository,
      dataSource,
      manager,
      receivablesService,
    } = buildService();

    await service.create(
      buildDto({ billingFrequency: BillingFrequency.SEMIANNUAL }) as never,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.getRepository).toHaveBeenCalledWith(Contract);
    expect(contractsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lessorName: "江阴市示例产业园有限公司",
        lessorLicenseCode: "91320281TEST000001",
        lessorContactName: "吴孝斌",
        lessorPhone: "18651510352",
        lessorSafetyManager: "吴孝斌",
        tenantName: "测试租户有限公司",
        contactName: "张三",
        tenantPhone: "13800000000",
        licenseCode: "91320281TEST000002",
        tenantSafetyManager: "张三",
        signedDate: "2026-08-28",
        electricUnitPrice: 0.95,
        electricLineLossPercent: 5,
        waterUnitPrice: 1,
        earlyTerminationPenaltyAmount: 4166.67,
        billingFrequency: BillingFrequency.SEMIANNUAL,
      }),
    );
    expect(receivablesService.syncContractSchedules).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        id: "contract-new",
        billingFrequency: BillingFrequency.SEMIANNUAL,
      }),
    );
    expect(contractsRepository.findOneOrFail).toHaveBeenCalledWith({
      where: { id: "contract-new" },
    });
  });

  it("returns a newly saved contract without waiting for PDF preparation", async () => {
    let markPdfStarted: () => void = () => undefined;
    const pdfStarted = new Promise<"pdf-started">((resolve) => {
      markPdfStarted = () => resolve("pdf-started");
    });
    jest.mocked(buildContractDocumentPdf).mockImplementationOnce(() => {
      markPdfStarted();
      return new Promise<never>(() => undefined);
    });
    const { service } = buildService();

    const outcome = await Promise.race([
      service
        .create(buildDto() as never)
        .then((contract) => ({ type: "saved" as const, contract })),
      pdfStarted.then(() => ({ type: "pdf-started" as const })),
    ]);

    expect(outcome).toEqual({
      type: "saved",
      contract: expect.objectContaining({ id: "contract-new" }),
    });
  });

  it("returns an updated contract without waiting for PDF preparation", async () => {
    let markPdfStarted: () => void = () => undefined;
    const pdfStarted = new Promise<"pdf-started">((resolve) => {
      markPdfStarted = () => resolve("pdf-started");
    });
    jest.mocked(buildContractDocumentPdf).mockImplementationOnce(() => {
      markPdfStarted();
      return new Promise<never>(() => undefined);
    });
    const { service } = buildService({
      existingContract: existingContract(),
    });

    const outcome = await Promise.race([
      service
        .update("contract-1", buildDto({ depositAmount: 5000 }) as never)
        .then((contract) => ({ type: "saved" as const, contract })),
      pdfStarted.then(() => ({ type: "pdf-started" as const })),
    ]);

    expect(outcome).toEqual({
      type: "saved",
      contract: expect.objectContaining({ id: "contract-1" }),
    });
  });

  it("returns a cached contract PDF without rebuilding it", async () => {
    const cached = Buffer.from("cached-pdf");
    const { service, filesService } = buildService({
      existingContract: existingContract(),
      cachedGeneratedDocument: cached,
    });

    const generated = await service.generateDocument("contract-1");

    expect(generated.buffer).toEqual(cached);
    expect(filesService.readGeneratedContractDocument).toHaveBeenCalledWith(
      "contract-1",
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(buildContractDocumentPdf).not.toHaveBeenCalled();
    expect(filesService.saveGeneratedContractDocument).not.toHaveBeenCalled();
  });

  it("keeps a newly saved contract when PDF preparation fails", async () => {
    const { service } = buildService();
    const logger = (
      service as unknown as { logger: { error: (message: string) => void } }
    ).logger;
    jest.spyOn(logger, "error").mockImplementation(() => undefined);
    jest
      .mocked(buildContractDocumentPdf)
      .mockRejectedValueOnce(new Error("render failed"));

    await expect(service.create(buildDto() as never)).resolves.toEqual(
      expect.objectContaining({ id: "contract-new" }),
    );
  });

  it("uses only the entered deposit and initializes legacy settlement fields", async () => {
    const { service, contractsRepository, depositsService } = buildService({
      depositAccount: {
        heldAmount: 8000,
        latestContractId: "source-contract",
      },
    });

    await service.create(buildDto({ depositAmount: 0 }) as never);

    expect(depositsService.getAccount).not.toHaveBeenCalled();
    const values = contractsRepository.create.mock.calls.at(-1)?.[0];
    expect(values).toEqual(
      expect.objectContaining({
        depositAmount: 0,
        depositSettlementMode: DepositSettlementMode.INITIAL,
        depositCarryoverAmount: 0,
        depositCarryoverSourceContractId: null,
      }),
    );
  });

  it("preserves new contract fields when a V0.5.0 update omits them", async () => {
    const contract = existingContract();
    const {
      service,
      contractsRepository,
      depositsService,
      receivablesService,
    } = buildService({ existingContract: contract });

    await service.update(
      "contract-1",
      buildDto({ contactName: " 新联系人 " }) as never,
    );

    expect(depositsService.getAccount).not.toHaveBeenCalled();
    expect(contractsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contactName: "新联系人",
        billingFrequency: BillingFrequency.SEMIANNUAL,
        depositSettlementMode: DepositSettlementMode.CARRYOVER,
        depositCarryoverAmount: 8000,
        depositCarryoverSourceContractId: "source-contract",
      }),
    );
    expect(receivablesService.syncContractSchedules).not.toHaveBeenCalled();
  });

  it("preserves manually patched future schedules for non-shape updates", async () => {
    const contract = existingContract();
    const { service, receivablesService } = buildService({
      existingContract: contract,
    });

    await service.update(
      "contract-1",
      buildDto({
        contactName: "新联系人",
        billingFrequency: BillingFrequency.SEMIANNUAL,
      }) as never,
    );

    expect(receivablesService.syncContractSchedules).not.toHaveBeenCalled();
  });

  it("compares annual rent schedule shape by cents", async () => {
    const contract = existingContract();
    const { service, receivablesService } = buildService({
      existingContract: contract,
    });

    await service.update(
      "contract-1",
      buildDto({
        annualRent: 50000.000001,
        billingFrequency: BillingFrequency.SEMIANNUAL,
      }) as never,
    );

    expect(receivablesService.syncContractSchedules).not.toHaveBeenCalled();
  });

  it.each([
    ["start date", { startDate: "2026-10-01" }],
    ["end date", { endDate: "2027-09-30" }],
    ["annual rent", { annualRent: 50000.01 }],
    ["billing frequency", { billingFrequency: BillingFrequency.ANNUAL }],
  ])("synchronizes schedules when %s changes", async (_case, dtoOverrides) => {
    const contract = existingContract();
    const { service, receivablesService, manager } = buildService({
      existingContract: contract,
    });

    await service.update(
      "contract-1",
      buildDto({
        billingFrequency: BillingFrequency.SEMIANNUAL,
        ...dtoOverrides,
      }) as never,
    );

    expect(receivablesService.syncContractSchedules).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ id: "contract-1" }),
    );
  });

  it("allows empty party information when updating a contract", async () => {
    const contract = existingContract();
    const { service, contractsRepository } = buildService({
      existingContract: contract,
    });

    await service.update(
      "contract-1",
      buildDto({
        lessorName: "  ",
        lessorLicenseCode: "  ",
        lessorContactName: "  ",
        lessorPhone: "  ",
        tenantName: "  ",
        contactName: "  ",
        tenantPhone: "  ",
        licenseCode: "  ",
      }) as never,
    );

    expect(contractsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lessorName: "",
        lessorLicenseCode: "",
        lessorContactName: "",
        lessorPhone: "",
        tenantName: "",
        contactName: "",
        tenantPhone: "",
        licenseCode: "",
      }),
    );
  });

  it("does not return a saved contract when schedule synchronization fails", async () => {
    const { service, contractsRepository, dataSource, receivablesService } =
      buildService();
    receivablesService.syncContractSchedules.mockRejectedValue(
      new Error("schedule sync failed"),
    );

    await expect(service.create(buildDto() as never)).rejects.toThrow(
      "schedule sync failed",
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(contractsRepository.save).toHaveBeenCalledTimes(1);
    expect(contractsRepository.findOneOrFail).not.toHaveBeenCalled();
  });
});
