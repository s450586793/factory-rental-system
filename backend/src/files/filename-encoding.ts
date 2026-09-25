import { isUtf8 } from "node:buffer";

export function normalizeUploadFilename(filename: string): string {
  // multipart 的文件名可能将 UTF-8 字节按 Latin-1 解读；只恢复可无损解码的名称。
  for (const character of filename) {
    if (character.charCodeAt(0) > 0xff) return filename;
  }
  const bytes = Buffer.from(filename, "latin1");
  return isUtf8(bytes) ? bytes.toString("utf8") : filename;
}
