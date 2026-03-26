import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import type { AppConfig } from "../config/app.config";

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  getHealth() {
    const app = this.configService.getOrThrow<AppConfig>("app");

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      app: {
        name: app.name,
        environment: app.environment,
      },
      database: {
        initialized: this.dataSource.isInitialized,
      },
    };
  }
}
