import { ArgumentsHost, BadRequestException, Logger, PayloadTooLargeException } from "@nestjs/common";
import { FileUploadExceptionFilter } from "./file-upload-exception.filter";

function createHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe("FileUploadExceptionFilter", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns a clear size limit message for oversized files", () => {
    const filter = new FileUploadExceptionFilter();
    const { host, status, json } = createHost();

    filter.catch(new PayloadTooLargeException("File too large"), host);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      statusCode: 413,
      message: "单个文件不能超过 25 MB",
    });
  });

  it("returns a retriable message when multipart upload is interrupted", () => {
    const filter = new FileUploadExceptionFilter();
    const { host, status, json } = createHost();

    filter.catch(new Error("Unexpected end of form"), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: "文件上传中断，请重新选择文件后再试",
    });
  });

  it("preserves client validation failures", () => {
    const filter = new FileUploadExceptionFilter();
    const { host, status, json } = createHost();

    filter.catch(new BadRequestException("附件类型无效"), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: "附件类型无效",
    });
  });
});
