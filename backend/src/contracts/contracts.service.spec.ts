import { ContractStatus } from "./contract.entity";
import { ContractsService } from "./contracts.service";

function buildService(options: { existingContract?: Record<string, unknown> } = {}) {
  const contractsRepository = {
    findOne: jest.fn().mockResolvedValue(options.existingContract ?? null),
    find: jest.fn().mockResolvedValue(options.existingContract ? [options.existingContract] : []),
    create: jest.fn().mockImplementation((value) => value),
    save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
  };
  const unitsRepository = {
    findOne: jest.fn().mockResolvedValue({ id: "unit-1" }),
  };
  const filesService = {
    findOneOrFail: jest.fn(),
    findByIds: jest.fn(),
  };
  const ServiceWithMocks = ContractsService as unknown as new (
    contractsRepository: unknown,
    unitsRepository: unknown,
    filesService: unknown,
  ) => ContractsService;

  return {
    service: new ServiceWithMocks(contractsRepository, unitsRepository, filesService),
    contractsRepository,
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
  it("normalizes and saves both parties when creating a contract", async () => {
    const { service, contractsRepository } = buildService();

    await service.create(buildDto() as never);

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
      }),
    );
  });

  it("allows empty party information when updating a contract", async () => {
    const existingContract = {
      id: "contract-1",
      unitId: "unit-1",
      lessorName: "原甲方",
      lessorLicenseCode: "original-lessor-license",
      lessorContactName: "原联系人",
      lessorPhone: "12345678900",
      tenantName: "原乙方",
      contactName: "原负责人",
      tenantPhone: "12345678901",
      licenseCode: "original-tenant-license",
      startDate: "2026-09-01",
      endDate: "2027-08-31",
      annualRent: 50000,
      depositAmount: 10000,
      status: ContractStatus.FUTURE,
    };
    const { service, contractsRepository } = buildService({ existingContract });

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
});
