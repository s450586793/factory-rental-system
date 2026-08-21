import { UtilityChargeStatus } from "./utility-charge-record.entity";
import { UtilitiesService } from "./utilities.service";

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
});
