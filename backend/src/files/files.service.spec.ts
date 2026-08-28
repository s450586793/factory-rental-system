import { FilesService } from "./files.service";
import { mkdir, readFile, readdir, rename, writeFile } from "fs/promises";

jest.mock("fs/promises", () => ({
  mkdir: jest.fn(),
  readFile: jest.fn(),
  readdir: jest.fn(),
  rename: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
  writeFile: jest.fn(),
}));

describe("FilesService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(readdir).mockResolvedValue([] as never);
  });

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

  it("stores a generated contract PDF atomically in persistent storage", async () => {
    const { service } = createService();
    const cache = service as unknown as {
      saveGeneratedContractDocument: (
        contractId: string,
        revision: string,
        buffer: Buffer,
      ) => Promise<void>;
    };
    const buffer = Buffer.from("pdf");

    await cache.saveGeneratedContractDocument("contract-1", "a".repeat(64), buffer);

    expect(mkdir).toHaveBeenCalledWith("/storage/generated-contracts", { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/^\/storage\/generated-contracts\/\.contract-contract-1-[a-f0-9-]+\.tmp$/),
      buffer,
    );
    expect(rename).toHaveBeenCalledWith(
      expect.stringMatching(/^\/storage\/generated-contracts\/\.contract-contract-1-[a-f0-9-]+\.tmp$/),
      `/storage/generated-contracts/contract-contract-1-${"a".repeat(64)}.pdf`,
    );
  });

  it("reads a matching generated contract PDF and treats a missing cache as empty", async () => {
    const { service } = createService();
    const cache = service as unknown as {
      readGeneratedContractDocument: (contractId: string, revision: string) => Promise<Buffer | null>;
    };
    const buffer = Buffer.from("cached-pdf");
    jest.mocked(readFile).mockResolvedValueOnce(buffer);

    await expect(cache.readGeneratedContractDocument("contract-1", "b".repeat(64))).resolves.toEqual(buffer);
    expect(readFile).toHaveBeenCalledWith(
      `/storage/generated-contracts/contract-contract-1-${"b".repeat(64)}.pdf`,
    );

    jest.mocked(readFile).mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));
    await expect(cache.readGeneratedContractDocument("contract-1", "c".repeat(64))).resolves.toBeNull();
  });
});
