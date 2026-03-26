import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import type { AppConfig } from "./config/app.config";
import type { AuthConfig } from "./config/auth.config";
import { setupSwagger } from "./openapi/swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const runtime = configService.getOrThrow<AppConfig>("app");
  const auth = configService.getOrThrow<AuthConfig>("auth");

  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: runtime.frontendOrigins.length ? runtime.frontendOrigins : true,
    credentials: true,
  });
  setupSwagger(app, auth.cookieName);

  await app.listen(runtime.port);
}

bootstrap();
