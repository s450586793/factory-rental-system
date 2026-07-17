import type { Response } from "express";
import { FilesController } from "./files.controller";
import type { FilesService } from "./files.service";

describe("FilesController", () => {
  it("allows a stored file to be embedded by the same site for preview", async () => {
    const filesService = {
      getFileResponseMeta: jest.fn().mockResolvedValue({
        file: {
          mimeType: "application/pdf",
          originalName: "contract.pdf",
        },
        absolutePath: "/tmp/contract.pdf",
      }),
    } as unknown as FilesService;
    const controller = new FilesController(filesService);
    const setHeader = jest.fn();
    const sendFile = jest.fn();

    await controller.download("stored-file-id", { setHeader, sendFile } as unknown as Response);

    expect(setHeader).toHaveBeenCalledWith("X-Frame-Options", "SAMEORIGIN");
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'self'",
    );
    expect(sendFile).toHaveBeenCalledWith("/tmp/contract.pdf");
  });
});
