import { DepositsService } from "./deposits.service";

describe("DepositsService", () => {
  it("associates uploaded payment voucher images when creating a deposit record", async () => {
    const depositsRepository = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockImplementation((deposit) => Promise.resolve(deposit)),
    };
    const contractsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: "contract-1",
        unitId: "unit-1",
        tenantName: "测试租户",
      }),
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
    const ServiceWithFiles = DepositsService as unknown as new (
      depositsRepository: unknown,
      contractsRepository: unknown,
      filesService: unknown,
    ) => DepositsService;
    const service = new ServiceWithFiles(depositsRepository, contractsRepository, filesService);

    await service.create({
      contractId: "contract-1",
      type: "received",
      paymentDate: "2026-07-17",
      amount: 10000,
      method: "转账",
      note: "",
      attachmentFileIds: ["voucher-1"],
    } as never);

    expect(filesService.resolvePaymentVoucherFiles).toHaveBeenCalledWith(["voucher-1"]);
    expect(depositsRepository.save).toHaveBeenCalledWith(
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
