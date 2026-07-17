import { FilesService } from "./files.service";

jest.mock("fs/promises", () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

describe("FilesService", () => {
  function createService() {
    const repository = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
      findBy: jest.fn(),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue({ root: "/storage" }),
    };

    return {
      service: new FilesService(repository as never, configService as never),
      repository,
    };
  }

  it("rejects a non-image payment voucher upload", async () => {
    const { service } = createService();

    await expect(
      service.saveUploadedFiles(
        [
          {
            originalname: "receipt.pdf",
            mimetype: "application/pdf",
            size: 128,
            buffer: Buffer.from("pdf"),
          },
        ],
        "payment-voucher" as never,
      ),
    ).rejects.toThrow("收款凭证仅支持 JPG、PNG 或 WebP 图片");
  });

  it("limits one record to ten payment voucher images", async () => {
    const { service } = createService();
    const resolvePaymentVoucherFiles = service as unknown as {
      resolvePaymentVoucherFiles: (fileIds: string[]) => Promise<unknown[]>;
    };

    await expect(
      Promise.resolve().then(() =>
        resolvePaymentVoucherFiles.resolvePaymentVoucherFiles(Array.from({ length: 11 }, (_, index) => `file-${index}`)),
      ),
    ).rejects.toThrow("每条记录最多关联 10 张收款凭证");
  });
});
