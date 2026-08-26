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

  it("defaults a new contract without a held deposit to annual and initial", async () => {
    const { service, contractsRepository, depositsService } = buildService();

    await service.create(buildDto() as never);

    expect(depositsService.getAccount).toHaveBeenCalledWith(
      "unit-1",
      "测试租户有限公司",
    );
    expect(contractsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        billingFrequency: BillingFrequency.ANNUAL,
        depositSettlementMode: DepositSettlementMode.INITIAL,
        depositCarryoverAmount: 0,
        depositCarryoverSourceContractId: null,
      }),
    );
  });

  it("defaults a new contract with a held deposit to a full carryover snapshot", async () => {
    const { service, contractsRepository } = buildService({
      depositAccount: {
        heldAmount: 8000,
        latestContractId: "source-contract",
      },
    });

    await service.create(buildDto() as never);

    expect(contractsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        depositSettlementMode: DepositSettlementMode.CARRYOVER,
        depositCarryoverAmount: 8000,
        depositCarryoverSourceContractId: "source-contract",
      }),
    );
  });

  it("forces an explicit initial settlement to zero without looking up an account", async () => {
    const { service, contractsRepository, depositsService } = buildService({
      depositAccount: {
        heldAmount: 8000,
        latestContractId: "source-contract",
      },
    });

    await service.create(
      buildDto({
        depositSettlementMode: DepositSettlementMode.INITIAL,
        depositCarryoverAmount: 7000,
        depositCarryoverSourceContractId: "source-contract",
      }) as never,
    );

    expect(depositsService.getAccount).not.toHaveBeenCalled();
    expect(contractsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        depositSettlementMode: DepositSettlementMode.INITIAL,
        depositCarryoverAmount: 0,
        depositCarryoverSourceContractId: null,
      }),
    );
  });

  it("saves an explicit carryover snapshot from the selected account", async () => {
    const { service, contractsRepository, depositsService } = buildService({
      depositAccount: {
        heldAmount: 10000,
        latestContractId: "source-contract",
      },
    });

    await service.create(
      buildDto({
        depositSettlementMode: DepositSettlementMode.CARRYOVER,
        depositCarryoverAmount: 6000,
        depositCarryoverSourceContractId: "source-contract",
      }) as never,
    );

    expect(depositsService.getAccount).toHaveBeenCalledWith(
      "unit-1",
      "测试租户有限公司",
      "source-contract",
    );
    expect(contractsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        depositSettlementMode: DepositSettlementMode.CARRYOVER,
        depositCarryoverAmount: 6000,
        depositCarryoverSourceContractId: "source-contract",
      }),
    );
  });

  it("rejects an explicit carryover source from another tenant account", async () => {
    const { service, depositsService, dataSource } = buildService();

    await expect(
      service.create(
        buildDto({
          depositSettlementMode: DepositSettlementMode.CARRYOVER,
          depositCarryoverAmount: 6000,
          depositCarryoverSourceContractId: "other-tenant-contract",
        }) as never,
      ),
    ).rejects.toThrow("未找到可结转的押金账户");

    expect(depositsService.getAccount).toHaveBeenCalledWith(
      "unit-1",
      "测试租户有限公司",
      "other-tenant-contract",
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it("uses the account latest contract when explicit carryover omits a source", async () => {
    const { service, contractsRepository, depositsService } = buildService({
      depositAccount: {
        heldAmount: 10000,
        latestContractId: "source-contract",
      },
    });

    await service.create(
      buildDto({
        depositSettlementMode: DepositSettlementMode.CARRYOVER,
        depositCarryoverAmount: 6000,
      }) as never,
    );

    expect(depositsService.getAccount).toHaveBeenCalledWith(
      "unit-1",
      "测试租户有限公司",
    );
    expect(contractsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        depositCarryoverAmount: 6000,
        depositCarryoverSourceContractId: "source-contract",
      }),
    );
  });

  it.each([
    "billingFrequency",
    "depositSettlementMode",
    "depositCarryoverAmount",
    "depositCarryoverSourceContractId",
  ])("rejects an explicit null %s when creating", async (property) => {
    const { service, dataSource, depositsService } = buildService();

    await expect(
      service.create(buildDto({ [property]: null }) as never),
    ).rejects.toThrow("不能为 null");

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(depositsService.getAccount).not.toHaveBeenCalled();
  });

  it("rejects carryover above the selected deposit account balance", async () => {
    const { service } = buildService({
      depositAccount: { heldAmount: 10000, latestContractId: "source-contract" },
    });

    await expect(
      service.create(
        buildDto({
          depositSettlementMode: DepositSettlementMode.CARRYOVER,
          depositCarryoverAmount: 12000,
        }) as never,
      ),
    ).rejects.toThrow("结转押金不能超过当前持有押金");
  });

  it("does not allow a positive carryover from a negative account balance", async () => {
    const { service } = buildService({
      depositAccount: { heldAmount: -6000, latestContractId: "source-contract" },
    });

    await expect(
      service.create(
        buildDto({
          depositSettlementMode: DepositSettlementMode.CARRYOVER,
          depositCarryoverAmount: 1,
        }) as never,
      ),
    ).rejects.toThrow("结转押金不能超过当前持有押金");
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

  it("does not revalidate an unchanged historical carryover snapshot", async () => {
    const contract = existingContract();
    const { service, depositsService, contractsRepository } = buildService({
      existingContract: contract,
      depositAccount: { heldAmount: 0, latestContractId: "source-contract" },
    });

    await service.update(
      "contract-1",
      buildDto({
        contactName: "历史联系人",
        billingFrequency: BillingFrequency.SEMIANNUAL,
        depositSettlementMode: DepositSettlementMode.CARRYOVER,
        depositCarryoverAmount: 8000,
        depositCarryoverSourceContractId: "source-contract",
      }) as never,
    );

    expect(depositsService.getAccount).not.toHaveBeenCalled();
    expect(contractsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        depositSettlementMode: DepositSettlementMode.CARRYOVER,
        depositCarryoverAmount: 8000,
        depositCarryoverSourceContractId: "source-contract",
      }),
    );
  });

  it("compares unchanged historical carryover amounts by cents", async () => {
    const contract = existingContract({ depositCarryoverAmount: 0.3 });
    const { service, depositsService, contractsRepository } = buildService({
      existingContract: contract,
      depositAccount: { heldAmount: 0, latestContractId: "source-contract" },
    });

    await service.update(
      "contract-1",
      buildDto({
        contactName: "按分比较",
        depositCarryoverAmount: 0.30000000000000004,
      }) as never,
    );

    expect(depositsService.getAccount).not.toHaveBeenCalled();
    expect(contractsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contactName: "按分比较",
        depositCarryoverAmount: 0.3,
      }),
    );
  });

  it.each([
    ["tenant", { tenantName: "另一个租户" }, "unit-1", "另一个租户"],
    ["unit", { unitId: "unit-2" }, "unit-2", "测试租户有限公司"],
  ])(
    "revalidates an unchanged carryover snapshot when the deposit account %s changes",
    async (_case, dtoOverrides, expectedUnitId, expectedTenantName) => {
      const contract = existingContract();
      const { service, depositsService, dataSource } = buildService({
        existingContract: contract,
      });

      await expect(
        service.update(
          "contract-1",
          buildDto({
            billingFrequency: BillingFrequency.SEMIANNUAL,
            ...dtoOverrides,
          }) as never,
        ),
      ).rejects.toThrow("未找到可结转的押金账户");

      expect(depositsService.getAccount).toHaveBeenCalledWith(
        expectedUnitId,
        expectedTenantName,
        "source-contract",
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    },
  );

  it("resets an initial settlement when the deposit account key changes", async () => {
    const contract = existingContract({
      depositSettlementMode: DepositSettlementMode.INITIAL,
      depositCarryoverAmount: 8000,
      depositCarryoverSourceContractId: "stale-source",
    });
    const { service, depositsService, contractsRepository } = buildService({
      existingContract: contract,
    });

    await service.update(
      "contract-1",
      buildDto({
        tenantName: " 新租户 ",
        billingFrequency: BillingFrequency.SEMIANNUAL,
      }) as never,
    );

    expect(depositsService.getAccount).not.toHaveBeenCalled();
    expect(contractsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantName: "新租户",
        depositSettlementMode: DepositSettlementMode.INITIAL,
        depositCarryoverAmount: 0,
        depositCarryoverSourceContractId: null,
      }),
    );
  });

  it("preserves manually patched future schedules for non-shape updates", async () => {
    const contract = existingContract();
    const { service, receivablesService } = buildService({
      existingContract: contract,
      depositAccount: { heldAmount: 10000, latestContractId: "source-contract" },
    });

    await service.update(
      "contract-1",
      buildDto({
        contactName: "新联系人",
        billingFrequency: BillingFrequency.SEMIANNUAL,
        depositCarryoverAmount: 9000,
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

  it.each([
    "billingFrequency",
    "depositSettlementMode",
    "depositCarryoverAmount",
    "depositCarryoverSourceContractId",
  ])("rejects an explicit null %s when updating", async (property) => {
    const { service, dataSource, depositsService } = buildService({
      existingContract: existingContract(),
    });

    await expect(
      service.update(
        "contract-1",
        buildDto({ [property]: null }) as never,
      ),
    ).rejects.toThrow("不能为 null");

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(depositsService.getAccount).not.toHaveBeenCalled();
  });

  it("revalidates a carryover snapshot only when settlement fields change", async () => {
    const contract = existingContract();
    const { service, depositsService } = buildService({
      existingContract: contract,
      depositAccount: { heldAmount: 4000, latestContractId: "source-contract" },
    });

    await expect(
      service.update(
        "contract-1",
        buildDto({ depositCarryoverAmount: 5000 }) as never,
      ),
    ).rejects.toThrow("结转押金不能超过当前持有押金");

    expect(depositsService.getAccount).toHaveBeenCalledTimes(1);
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
        depositSettlementMode: DepositSettlementMode.INITIAL,
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
        depositSettlementMode: DepositSettlementMode.INITIAL,
        depositCarryoverAmount: 0,
        depositCarryoverSourceContractId: null,
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
