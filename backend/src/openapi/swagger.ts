import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function setupSwagger(app: INestApplication, cookieName: string) {
  const config = new DocumentBuilder()
    .setTitle("厂房出租管理系统 API")
    .setDescription("单超级用户使用的厂房出租管理系统后端接口文档")
    .setVersion("1.0.0")
    .addCookieAuth(cookieName)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document, {
    jsonDocumentUrl: "api/docs-json",
  });
}
