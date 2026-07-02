import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { DeploymentUpdateService } from "./deployment-update.service";

@ApiTags("deployment-update")
@Controller("deployment-update")
@UseGuards(JwtAuthGuard)
export class DeploymentUpdateController {
  constructor(private readonly deploymentUpdateService: DeploymentUpdateService) {}

  @Get("status")
  getStatus() {
    return this.deploymentUpdateService.getStatus();
  }

  @Post("start")
  startUpdate() {
    return this.deploymentUpdateService.startUpdate();
  }
}
