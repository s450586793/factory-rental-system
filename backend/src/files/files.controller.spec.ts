import type { Response } from "express";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

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

describe("FilesController upload limits", () => {
  let app: INestApplication;
  const saveUploadedFiles = jest.fn(async (files: Express.Multer.File[]) => files.map((file) => ({
    originalName: file.originalname, size: file.size,
  })));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [{ provide: FilesService, useValue: { saveUploadedFiles } }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(() => saveUploadedFiles.mockClear());
  afterAll(async () => { await app?.close(); });

  it.each([26, 100])("accepts a %i MB multipart file", async (megabytes) => {
    const size = megabytes * 1024 * 1024;
    const response = await request(app.getHttpServer()).post("/files/upload")
      .field("category", "contract-attachment")
      .attach("files", Buffer.alloc(size), { filename: "signed.pdf", contentType: "application/pdf" })
      .expect(201);
    expect(response.body).toEqual([{ originalName: "signed.pdf", size }]);
    expect(saveUploadedFiles).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("rejects a file one byte above 100 MB before saving", async () => {
    const response = await request(app.getHttpServer()).post("/files/upload")
      .field("category", "contract-attachment")
      .attach("files", Buffer.alloc(100 * 1024 * 1024 + 1), { filename: "oversized.pdf", contentType: "application/pdf" })
      .expect(413);
    expect(response.body.message).toBe("单个文件不能超过 100 MB");
    expect(saveUploadedFiles).not.toHaveBeenCalled();
  }, 30_000);
});
