import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import type { DeploymentUpdateConfig } from "../config/deployment-update.config";
import { DeploymentUpdateController } from "./deployment-update.controller";
import { DeploymentUpdateService, DOCKER_ENGINE_CLIENT } from "./deployment-update.service";
import { DockerEngineHttpClient } from "./docker-engine.client";

@Module({
  imports: [ConfigModule],
  controllers: [DeploymentUpdateController],
  providers: [
    {
      provide: "DEPLOYMENT_UPDATE_CONFIG",
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.getOrThrow<DeploymentUpdateConfig>("deploymentUpdate"),
    },
    {
      provide: DOCKER_ENGINE_CLIENT,
      inject: ["DEPLOYMENT_UPDATE_CONFIG"],
      useFactory: (config: DeploymentUpdateConfig) => new DockerEngineHttpClient(config),
    },
    DeploymentUpdateService,
  ],
})
export class DeploymentUpdateModule {}
