import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BoundingBoxService } from "./bounding-box.service";
import { BoundingBoxController } from "./bounding-box.controller";
import { BoundingBox } from "./entities/bounding-box.entity";
import { Slide } from "src/slide/entities/slide.entity";

@Module({
    imports: [TypeOrmModule.forFeature([BoundingBox, Slide])],
    controllers: [BoundingBoxController],
    providers: [BoundingBoxService],
})
export class BoundingBoxModule {}
