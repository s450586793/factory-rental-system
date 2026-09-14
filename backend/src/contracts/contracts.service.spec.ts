import { BillingFrequency, DepositSettlementMode } from "./contract.enums";
import { ContractFinancialHistory } from "./contract-financial-history.entity";
import { Contract, ContractStatus } from "./contract.entity";
import { ContractsService } from "./contracts.service";

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
      if (entity === ContractFinancialHistory) {
        return historyRepository;
      }
      throw new Error(`Unexpected repository: ${entity.name}`);
    }),
  };
  const historyRepository = {
    create: jest.fn((values) => values),
    insert: jest.fn().mockResolvedValue(undefined),
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
  const documentQueue = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    kick: jest.fn(),
    generate: jest.fn().mockResolvedValue({
      filename: "contract.pdf",
      mimeType: "application/pdf",
      buffer: options.cachedGeneratedDocument,
    }),
  };
  const ServiceWithMocks = ContractsService as unknown as new (
    contractsRepository: unknown,
    unitsRepository: unknown,
    filesService: unknown,
    dataSource: unknown,
    receivablesService: unknown,
    documentQueue: unknown,
  ) => ContractsService;

  return {
    service: new ServiceWithMocks(
      contractsRepository,
      unitsRepository,
      filesService,
      dataSource,
      receivablesService,
      documentQueue,
    ),
    contractsRepository,
    dataSource,
    depositsService,
    filesService,
    manager,
    receivablesService,
    documentQueue,
    historyRepository,
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
    const { service, documentQueue, manager } = buildService();
    documentQueue.generate.mockImplementation(
      () => new Promise(() => undefined),
    );
    await expect(service.create(buildDto() as never)).resolves.toEqual(
      expect.objectContaining({ id: "contract-new" }),
    );
    expect(documentQueue.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ id: "contract-new" }),
      expect.objectContaining({ id: "unit-1" }),
    );
    expect(documentQueue.kick).toHaveBeenCalledTimes(1);
    expect(documentQueue.generate).not.toHaveBeenCalled();
  });

  it("returns an updated contract without waiting for PDF preparation", async () => {
    const { service, documentQueue } = buildService({
      existingContract: existingContract(),
    });
    documentQueue.generate.mockImplementation(
      () => new Promise(() => undefined),
    );
    await expect(
      service.update("contract-1", buildDto() as never),
    ).resolves.toEqual(expect.objectContaining({ id: "contract-1" }));
    expect(documentQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(documentQueue.kick).toHaveBeenCalledTimes(1);
    expect(documentQueue.generate).not.toHaveBeenCalled();
  });

  it("returns a cached contract PDF without rebuilding it", async () => {
    const cached = Buffer.from("cached-pdf");
    const { service, documentQueue } = buildService({
      existingContract: existingContract(),
      cachedGeneratedDocument: cached,
    });

    const generated = await service.generateDocument("contract-1");

    expect(generated.buffer).toEqual(cached);
    expect(documentQueue.generate).toHaveBeenCalledWith("contract-1");
  });

  it("rolls back rather than returning a contract without a durable PDF task", async () => {
    const { service, documentQueue } = buildService();
    documentQueue.enqueue.mockRejectedValue(new Error("queue unavailable"));
    await expect(service.create(buildDto() as never)).rejects.toThrow(
      "queue unavailable",
    );
    expect(documentQueue.kick).not.toHaveBeenCalled();
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

  it("records six initial financial values and the authenticated actor in the saving transaction", async () => {
    const { service, historyRepository, documentQueue } = buildService();
    const actor = { id: "user-1", username: "admin" };
    await service.create(buildDto() as never, actor);
    expect(historyRepository.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          contractId: "contract-new",
          field: "annualRent",
          beforeValue: null,
          afterValue: "50000.00",
          actorId: "user-1",
          actorUsername: "admin",
        }),
        expect.objectContaining({
          field: "electricUnitPrice",
          beforeValue: null,
          afterValue: "0.9500",
        }),
        expect.objectContaining({
          field: "waterUnitPrice",
          beforeValue: null,
          afterValue: "1.0000",
        }),
      ]),
    );
    expect(historyRepository.insert.mock.calls[0][0]).toHaveLength(6);
    expect(historyRepository.insert.mock.invocationCallOrder[0]).toBeLessThan(
      documentQueue.kick.mock.invocationCallOrder[0],
    );
  });

  it("records only actual monetary changes and reads the previous value under a transaction lock", async () => {
    const previous = existingContract();
    const { service, historyRepository, contractsRepository } = buildService({
      existingContract: previous,
    });
    await service.update(
      "contract-1",
      { ...previous, depositAmount: 9999.99 } as never,
      { id: "user-2", username: "operator" },
    );
    expect(historyRepository.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        field: "depositAmount",
        beforeValue: "10000.00",
        afterValue: "9999.99",
        actorUsername: "operator",
      }),
    ]);
    expect(contractsRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: "pessimistic_write" } }),
    );
  });

  it("omits history for normalized no-op monetary values", async () => {
    const previous = existingContract();
    const { service, historyRepository } = buildService({
      existingContract: previous,
    });
    await service.update("contract-1", {
      ...previous,
      contactName: "新联系人",
      annualRent: 50000.000001,
    } as never);
    expect(historyRepository.insert).not.toHaveBeenCalled();
  });

  it("fails the contract transaction when history cannot be persisted", async () => {
    const { service, historyRepository, documentQueue } = buildService();
    historyRepository.insert.mockRejectedValue(
      new Error("history write failed"),
    );
    await expect(service.create(buildDto() as never)).rejects.toThrow(
      "history write failed",
    );
    expect(documentQueue.enqueue).not.toHaveBeenCalled();
    expect(documentQueue.kick).not.toHaveBeenCalled();
  });
});
