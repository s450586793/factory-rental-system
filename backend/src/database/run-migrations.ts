import dataSource from "./typeorm.datasource";

async function bootstrap() {
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    console.log("Database migrations completed");
  } finally {
    await dataSource.destroy();
  }
}

bootstrap().catch((error) => {
  console.error("Database migration failed", error);
  process.exit(1);
});
