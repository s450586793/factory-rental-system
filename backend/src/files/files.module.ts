import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StoredFile } from "./stored-file.entity";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";

@Module({
  imports: [TypeOrmModule.forFeature([StoredFile])],
  providers: [FilesService],
  controllers: [FilesController],
  exports: [FilesService, TypeOrmModule],
})
export class FilesModule {}
