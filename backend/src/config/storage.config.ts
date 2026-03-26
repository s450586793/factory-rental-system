import { join } from "path";
import { registerAs } from "@nestjs/config";
import { readOptionalString, readString } from "./env.helpers";

export type StorageConfig = {
  root: string;
  pdfFontPath?: string;
};

export function resolveStorageConfig(env: NodeJS.ProcessEnv): StorageConfig {
  return {
    root: readString(env, "STORAGE_ROOT", { defaultValue: join(process.cwd(), "storage") }),
    pdfFontPath: readOptionalString(env, "PDF_FONT_PATH"),
  };
}

export default registerAs("storage", () => resolveStorageConfig(process.env));
