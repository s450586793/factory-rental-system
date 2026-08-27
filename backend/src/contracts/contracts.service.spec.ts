import { BillingFrequency, DepositSettlementMode } from "./contract.enums";
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
    tenantName: "测试租户有限公司",
    contactName: "原负责人",
    tenantPhone: "12345678901",
    licenseCode: "original-tenant-license",
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    annualRent: 50000,
    depositAmount: 10000,
    billingFrequency: BillingFrequency.SEMIANNUAL,
    depositSettlementMode: DepositSettlementMode.CARRYOVER,
    depositCarryoverAmount: 8000,
    depositCarryoverSourceContractId: "source-contract",
    status: ContractStatus.FUTURE,
    ...overrides,
  };
}

function buildService(options: {
  existingContract?: Record<string, unknown>;
  depositAccount?: Record<string, unknown> | null;
} = {}) {
  let savedContract: Record<string, unknown> | null = null;
  const contractsRepository = {
    findOne: jest.fn().mockResolvedValue(options.existingContract ?? null),
    find: jest.fn().mockResolvedValue(options.existingContract ? [options.existingContract] : []),
    create: jest.fn().mockImplementation((value) => value),
    save: jest.fn().mockImplementation((value) => {
      savedContract = {
        ...value,
        id: (value as Record<string, unknown>).id ?? "contract-new",
      };
      return Promise.resolve(savedContract);
    }),
    findOneOrFail: jest.fn().mockImplementation(() => Promise.resolve(savedContract)),
  };
  const unitsRepository = {
    findOne: jest.fn().mockResolvedValue({ id: "unit-1" }),
  };
  const filesService = {
    findOneOrFail: jest.fn(),
    findByIds: jest.fn(),
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
    tenantName: "  测试租户有限公司  ",
    contactName: "  张三  ",
    tenantPhone: "  13800000000  ",
    licenseCode: "  91320281TEST000002  ",
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    annualRent: 50000,
    depositAmount: 10000,
    ...overrides,
  };
}

describe("ContractsService", () => {
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
        tenantName: "测试租户有限公司",
        contactName: "张三",
        tenantPhone: "13800000000",
        licenseCode: "91320281TEST000002",
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

  it("uses only the entered deposit amount even when a deposit account already exists", async () => {
    const { service, contractsRepository, depositsService } = buildService({
      depositAccount: {
        heldAmount: 8000,
        latestContractId: "source-contract",
      },
    });

    await service.create(buildDto({ depositAmount: 0 }) as never);

    expect(depositsService.getAccount).not.toHaveBeenCalled();
    const values = contractsRepository.create.mock.calls.at(-1)?.[0];
    expect(values).toEqual(expect.objectContaining({ depositAmount: 0 }));
    expect(values).not.toHaveProperty("depositSettlementMode");
    expect(values).not.toHaveProperty("depositCarryoverAmount");
    expect(values).not.toHaveProperty("depositCarryoverSourceContractId");
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
    const { service, receivablesService } = buildService({ existingContract: contract });

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
    const { service, contractsRepository } = buildService({ existingContract: contract });

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
    const {
      service,
      contractsRepository,
      dataSource,
      receivablesService,
    } = buildService();
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
