import "dotenv/config";
import dataSource from "./typeorm.datasource";
import { resolveAuthConfig } from "../config/auth.config";
import { AdminUser } from "../users/admin-user.entity";
import { upsertAdminUser } from "./seeds/admin-user.seed";

async function bootstrap() {
  await dataSource.initialize();
  try {
    const auth = resolveAuthConfig(process.env);
    await upsertAdminUser(dataSource.getRepository(AdminUser), auth.adminUsername, auth.adminPassword);
    console.log(`Admin user "${auth.adminUsername}" is ready`);
  } finally {
    await dataSource.destroy();
  }
}

bootstrap().catch((error) => {
  console.error("Admin seed failed", error);
  process.exit(1);
});
