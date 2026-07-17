import { RentPaymentsService } from "./rent-payments.service";

describe("RentPaymentsService", () => {
  it("associates uploaded payment voucher images when creating a rent payment", async () => {
    const rentPaymentsRepository = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((payment) => Promise.resolve(payment)),
    };
    const contractsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: "contract-1",
        unitId: "unit-1",
        tenantName: "测试租户",
      }),
    };
    const receiptsRepository = {
      findOne: jest.fn(),
    };
    const filesService = {
      resolvePaymentVoucherFiles: jest.fn().mockResolvedValue([
        {
          id: "voucher-1",
          category: "payment-voucher",
          mimeType: "image/png",
        },
      ]),
    };
    const ServiceWithFiles = RentPaymentsService as unknown as new (
      rentPaymentsRepository: unknown,
      contractsRepository: unknown,
      receiptsRepository: unknown,
      filesService: unknown,
    ) => RentPaymentsService;
    const service = new ServiceWithFiles(
      rentPaymentsRepository,
      contractsRepository,
      receiptsRepository,
      filesService,
    );

    await service.create({
      contractId: "contract-1",
      paymentDate: "2026-07-17",
      amount: 5000,
      method: "转账",
      note: "",
      attachmentFileIds: ["voucher-1"],
    } as never);

    expect(filesService.resolvePaymentVoucherFiles).toHaveBeenCalledWith(["voucher-1"]);
    expect(rentPaymentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentFiles: [
          expect.objectContaining({
            id: "voucher-1",
          }),
        ],
      }),
    );
  });
});
