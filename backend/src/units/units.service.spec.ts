import { UnitsService } from "./units.service";

describe("UnitsService", () => {
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
    const unitsRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: "unit-1",
          code: "5",
          location: "北门仓库",
          area: 400,
          contracts: [contract],
          meterConfigs: [],
        },
      ]),
    };
    const ServiceWithMocks = UnitsService as unknown as new (
      unitsRepository: unknown,
      contractsRepository: unknown,
      meterConfigsRepository: unknown,
    ) => UnitsService;
    const service = new ServiceWithMocks(unitsRepository, {}, {});

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
});
