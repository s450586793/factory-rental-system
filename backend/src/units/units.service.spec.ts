import { UnitsService } from "./units.service";

describe("UnitsService", () => {
  function createService(contracts: Record<string, unknown>[]) {
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
    };
    const ServiceWithMocks = UnitsService as unknown as new (
      unitsRepository: unknown,
      contractsRepository: unknown,
      meterConfigsRepository: unknown,
    ) => UnitsService;

    return new ServiceWithMocks(unitsRepository, {}, {});
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
    const service = createService([contract]);

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

  it("accrues receivable rent for each started lease year", async () => {
    const contract = {
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
      startDate: "2024-10-08",
      endDate: "2026-10-07",
      annualRent: 90000,
      depositAmount: 10000,
      rentPayments: [],
      businessLicenseFileId: null,
      businessLicenseFile: null,
      attachmentFiles: [],
    };
    const service = createService([contract]);

    const [unit] = await service.list();

    expect(unit.activeContract).toEqual(
      expect.objectContaining({
        receivableAmount: 180000,
        outstandingAmount: 180000,
      }),
    );
    expect(unit.contracts[0]).toEqual(
      expect.objectContaining({
        receivableAmount: 180000,
        outstandingAmount: 180000,
      }),
    );
  });
});
