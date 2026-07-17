import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { Response } from "express";

type UploadErrorPayload = {
  statusCode: number;
  message: string;
};

@Catch()
export class FileUploadExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(FileUploadExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      return;
    }

    const payload = resolveUploadError(exception);
    this.logger.warn(`文件上传失败：${describeException(exception)}`);
    response.status(payload.statusCode).json(payload);
  }
}

function resolveUploadError(exception: unknown): UploadErrorPayload {
  const detail = describeException(exception);

  if (/file too large/i.test(detail)) {
    return {
      statusCode: 413,
      message: "单个文件不能超过 25 MB",
    };
  }

  if (/unexpected end of form|request aborted|aborted/i.test(detail)) {
    return {
      statusCode: 400,
      message: "文件上传中断，请重新选择文件后再试",
    };
  }

  if (exception instanceof HttpException) {
    return {
      statusCode: exception.getStatus(),
      message: detail || "文件上传请求无效",
    };
  }

  return {
    statusCode: 500,
    message: "文件上传失败，请稍后重试",
  };
}

function describeException(exception: unknown) {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === "string") {
      return response;
    }

    const message = (response as { message?: unknown }).message;
    if (Array.isArray(message)) {
      return message.join("，");
    }

    if (typeof message === "string") {
      return message;
    }
  }

  return exception instanceof Error ? exception.message : "未知错误";
}
