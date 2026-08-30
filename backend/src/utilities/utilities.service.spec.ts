import { UtilityChargeStatus } from "./utility-charge-record.entity";
import { UtilitiesService } from "./utilities.service";
import { UtilityType } from "./utility-meter-config.entity";

describe("UtilitiesService", () => {
  function createService(record: { attachmentFiles: { id: string }[] }) {
    const utilityRecordsRepository = {
      findOne: jest.fn().mockResolvedValue(record),
      save: jest.fn().mockImplementation((savedRecord) => Promise.resolve(savedRecord)),
    };
    const filesService = {
      resolvePaymentVoucherFiles: jest
        .fn()
        .mockImplementation((fileIds: string[]) => Promise.resolve(fileIds.map((id) => ({ id })))),
    };
    const ServiceWithFiles = UtilitiesService as unknown as new (
      meterConfigsRepository: unknown,
      utilityRecordsRepository: unknown,
      utilityItemsRepository: unknown,
      unitsRepository: unknown,
      contractsRepository: unknown,
      receiptsRepository: unknown,
      filesService: unknown,
    ) => UtilitiesService;
    const service = new ServiceWithFiles(
      {},
      utilityRecordsRepository,
      {},
      {},
      {},
      {},
      filesService,
    );

    return { service, utilityRecordsRepository, filesService };
  }

  function createBillingService(type: UtilityType) {
    const meterConfig = {
      id: "meter-1",
      unitId: "unit-1",
      type,
      name: type === UtilityType.ELECTRIC ? "总电表" : "总水表",
      initialReading: 0,
      multiplier: 1,
      unitPrice: 9.99,
      lineLossPercent: 20,
      enabled: true,
    };
    const contract = {
      id: "contract-1",
      unitId: "unit-1",
      tenantName: "测试租户",
      tenantPhone: "13800000000",
      electricUnitPrice: 0.95,
      electricLineLossPercent: 5,
      waterUnitPrice: 1.2,
    };
    const meterConfigsRepository = {
      find: jest.fn().mockResolvedValue([meterConfig]),
      findBy: jest.fn().mockResolvedValue([meterConfig]),
    };
    const utilityRecordsRepository = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((record) => Promise.resolve(record)),
    };
    const unitsRepository = {
      findOne: jest.fn().mockResolvedValue({ id: "unit-1" }),
    };
    const contractsRepository = {
      findOne: jest.fn().mockResolvedValue(contract),
    };
    const ServiceWithMocks = UtilitiesService as unknown as new (
      meterConfigsRepository: unknown,
      utilityRecordsRepository: unknown,
      utilityItemsRepository: unknown,
      unitsRepository: unknown,
      contractsRepository: unknown,
      receiptsRepository: unknown,
      filesService: unknown,
    ) => UtilitiesService;
    const service = new ServiceWithMocks(
      meterConfigsRepository,
      utilityRecordsRepository,
      {},
      unitsRepository,
      contractsRepository,
      {},
      {},
    );

    return {
      service,
      utilityRecordsRepository,
      contractsRepository,
    };
  }

  it("associates resolved payment voucher files when marking a utility record as paid", async () => {
    const record = {
      id: "record-1",
      status: UtilityChargeStatus.UNPAID,
      attachmentFiles: [{ id: "existing-voucher" }],
    };
    const { service, utilityRecordsRepository, filesService } = createService(record);

    await service.markAsPaid("record-1", {
      paidAt: "2026-08-21",
      paymentMethod: "微信",
      attachmentFileIds: ["voucher-1"],
    } as never);

    expect(filesService.resolvePaymentVoucherFiles).toHaveBeenCalledWith(["voucher-1"]);
    expect(utilityRecordsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: UtilityChargeStatus.PAID,
        paidAt: "2026-08-21",
        paymentMethod: "微信",
        attachmentFiles: [{ id: "voucher-1" }],
      }),
    );
  });

  it("preserves existing payment voucher files when attachment ids are omitted", async () => {
    const record = {
      id: "record-1",
      status: UtilityChargeStatus.UNPAID,
      attachmentFiles: [{ id: "existing-voucher" }],
    };
    const { service, utilityRecordsRepository, filesService } = createService(record);

    await service.markAsPaid("record-1", {
      paidAt: "2026-08-21",
      paymentMethod: "微信",
    });

    expect(filesService.resolvePaymentVoucherFiles).not.toHaveBeenCalled();
    expect(utilityRecordsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentFiles: [{ id: "existing-voucher" }],
      }),
    );
  });

  it("clears payment voucher files when attachment ids are explicitly empty", async () => {
    const record = {
      id: "record-1",
      status: UtilityChargeStatus.UNPAID,
      attachmentFiles: [{ id: "existing-voucher" }],
    };
    const { service, utilityRecordsRepository, filesService } = createService(record);

    await service.markAsPaid("record-1", {
      attachmentFileIds: [],
    } as never);

    expect(filesService.resolvePaymentVoucherFiles).toHaveBeenCalledWith([]);
    expect(utilityRecordsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentFiles: [],
      }),
    );
  });

  it("preserves payment details when updating vouchers for an already paid utility record", async () => {
    const record = {
      id: "record-1",
      status: UtilityChargeStatus.PAID,
      paidAt: "2026-07-01",
      paymentMethod: "银行转账",
      attachmentFiles: [{ id: "existing-voucher" }],
    };
    const { service, utilityRecordsRepository } = createService(record);

    await service.markAsPaid("record-1", {
      attachmentFileIds: ["voucher-1"],
    } as never);

    expect(utilityRecordsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        paidAt: "2026-07-01",
        paymentMethod: "银行转账",
        attachmentFiles: [{ id: "voucher-1" }],
      }),
    );
  });

  it("prefills electric pricing from the selected contract", async () => {
    const { service, contractsRepository } = createBillingService(
      UtilityType.ELECTRIC,
    );

    const result = await service.getPrefill(
      "unit-1",
      UtilityType.ELECTRIC,
      "contract-1",
    );

    expect(contractsRepository.findOne).toHaveBeenCalledWith({
      where: { id: "contract-1" },
    });
    expect(result.meters[0]).toMatchObject({
      unitPrice: 0.95,
      lineLossPercent: 5,
    });
  });

  it("prefills water pricing from the selected contract without line loss", async () => {
    const { service } = createBillingService(UtilityType.WATER);

    const result = await service.getPrefill(
      "unit-1",
      UtilityType.WATER,
      "contract-1",
    );

    expect(result.meters[0]).toMatchObject({
      unitPrice: 1.2,
      lineLossPercent: 0,
    });
  });

  it("calculates and snapshots an electric charge using contract pricing", async () => {
    const { service, utilityRecordsRepository } = createBillingService(
      UtilityType.ELECTRIC,
    );

    await service.createRecord({
      unitId: "unit-1",
      contractId: "contract-1",
      type: UtilityType.ELECTRIC,
      previousReadAt: "2026-08-01",
      currentReadAt: "2026-08-30",
      items: [
        {
          meterConfigId: "meter-1",
          previousReading: 0,
          currentReading: 100,
        },
      ],
    });

    expect(utilityRecordsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 99.75,
        items: [
          expect.objectContaining({
            unitPriceSnapshot: 0.95,
            lineLossPercentSnapshot: 5,
            adjustedUsage: 105,
            amount: 99.75,
          }),
        ],
      }),
    );
  });
});
