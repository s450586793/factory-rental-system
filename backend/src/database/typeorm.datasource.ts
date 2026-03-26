import "dotenv/config";
import "reflect-metadata";
import { DataSource } from "typeorm";
import { resolveDatabaseConfig } from "../config/database.config";
import { buildTypeOrmOptions } from "./typeorm.config";

const database = resolveDatabaseConfig(process.env);

export default new DataSource({
  ...buildTypeOrmOptions(database),
  synchronize: false,
});
