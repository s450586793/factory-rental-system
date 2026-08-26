import { UnitsService } from "./units.service";

describe("UnitsService", () => {
  const emptySummary = {
    dueReceivableAmount: 0,
    duePaidAmount: 0,
    outstandingAmount: 0,
    prepaidAmount: 0,
    unallocatedAmount: 0,
  };

  function createService(
    contracts: Record<string, unknown>[],
    summaries = new Map<string, typeof emptySummary>(),
  ) {
    const unitsRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: "unit-1",
          code: "5",
          location: "北门仓库",
          area: 400,
          contracts,
          meterConfigs: [],
        },
      ]),
      findOne: jest.fn().mockResolvedValue({
        id: "unit-1",
        code: "5",
        location: "北门仓库",
        area: 400,
        contracts,
        meterConfigs: [],
      }),
    };
    const rentReceivablesService = {
      getContractSummaries: jest.fn().mockResolvedValue(summaries),
    };
    const ServiceWithMocks = UnitsService as unknown as new (
      unitsRepository: unknown,
      contractsRepository: unknown,
      meterConfigsRepository: unknown,
      rentReceivablesService: unknown,
    ) => UnitsService;

    return {
      service: new ServiceWithMocks(
        unitsRepository,
        {},
        {},
        rentReceivablesService,
      ),
      rentReceivablesService,
    };
  }

  it("serializes lessor information for active and historical contracts", async () => {
    const contract = {
      id: "contract-1",
      unitId: "unit-1",
      lessorName: "江阴市示例产业园有限公司",
      lessorLicenseCode: "91320281TEST000001",
      lessorContactName: "吴孝斌",
      lessorPhone: "18651510352",
      tenantName: "测试租户有限公司",
      contactName: "张三",
      tenantPhone: "13800000000",
      licenseCode: "91320281TEST000002",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      annualRent: 50000,
      depositAmount: 10000,
      rentPayments: [],
      businessLicenseFileId: null,
      businessLicenseFile: null,
      attachmentFiles: [],
    };
    const { service } = createService([contract]);

    const [unit] = await service.list();

    expect(unit.activeContract).toEqual(
      expect.objectContaining({
        lessorName: "江阴市示例产业园有限公司",
        lessorLicenseCode: "91320281TEST000001",
        lessorContactName: "吴孝斌",
        lessorPhone: "18651510352",
      }),
    );
    expect(unit.contracts[0]).toEqual(
      expect.objectContaining({
        lessorName: "江阴市示例产业园有限公司",
        lessorLicenseCode: "91320281TEST000001",
        lessorContactName: "吴孝斌",
        lessorPhone: "18651510352",
      }),
    );
  });

  it("serializes only matured schedules as current receivable", async () => {
    const activeContract = {
      id: "contract-1",
      unitId: "unit-1",
      lessorName: "吴孝斌",
      lessorLicenseCode: "",
      lessorContactName: "吴孝斌",
      lessorPhone: "",
      tenantName: "测试租户",
      contactName: "张三",
      tenantPhone: "13800000000",
      licenseCode: "",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      annualRent: 90000,
      depositAmount: 10000,
      billingFrequency: "annual",
      depositSettlementMode: "initial",
      depositCarryoverAmount: 2000,
      depositCarryoverSourceContractId: "previous-contract",
      rentPayments: [],
      businessLicenseFileId: "license-file",
      businessLicenseFile: { id: "license-file" },
      attachmentFiles: [{ id: "attachment-file" }],
    };
    const historicalContract = {
      ...activeContract,
      id: "contract-2",
      startDate: "2024-01-01",
      endDate: "2025-12-31",
    };
    const summaries = new Map([
      [
        "contract-1",
        {
          dueReceivableAmount: 180000,
          duePaidAmount: 100000,
          outstandingAmount: 80000,
          prepaidAmount: 50000,
          unallocatedAmount: 3000,
        },
      ],
      ["contract-2", emptySummary],
    ]);
    const { service, rentReceivablesService } = createService(
      [activeContract, historicalContract],
      summaries,
    );

    const [unit] = await service.list();

    expect(rentReceivablesService.getContractSummaries).toHaveBeenCalledTimes(
      1,
    );
    expect(rentReceivablesService.getContractSummaries).toHaveBeenCalledWith([
      "contract-1",
      "contract-2",
    ]);
    expect(unit.activeContract).toMatchObject({
      dueReceivableAmount: 180000,
      duePaidAmount: 100000,
      outstandingAmount: 80000,
      prepaidAmount: 50000,
      unallocatedAmount: 3000,
      annualRent: 90000,
      depositAmount: 10000,
      billingFrequency: "annual",
      depositSettlementMode: "initial",
      depositCarryoverAmount: 2000,
      depositCarryoverSourceContractId: "previous-contract",
      businessLicenseFileId: "license-file",
      attachmentFiles: [{ id: "attachment-file" }],
    });
    expect(
      unit.contracts.find((contract) => contract.id === "contract-1"),
    ).toMatchObject({
      dueReceivableAmount: 180000,
      duePaidAmount: 100000,
      outstandingAmount: 80000,
      prepaidAmount: 50000,
      unallocatedAmount: 3000,
    });
    expect(
      unit.contracts.find((contract) => contract.id === "contract-2"),
    ).toMatchObject(emptySummary);
    expect(unit.contracts[0]).not.toHaveProperty("receivableAmount");
    expect(unit.activeContract).not.toHaveProperty("receivableAmount");
  });

  it("loads persisted summaries once for detail and supports units without contracts", async () => {
    const { service, rentReceivablesService } = createService([], new Map());

    const unit = await service.getDetail("unit-1");

    expect(rentReceivablesService.getContractSummaries).toHaveBeenCalledTimes(
      1,
    );
    expect(rentReceivablesService.getContractSummaries).toHaveBeenCalledWith(
      [],
    );
    expect(unit).toMatchObject({
      activeContract: null,
      contractCount: 0,
      contracts: [],
    });
  });
});
