import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BoundingBoxService } from "./bounding-box.service";
import { BoundingBox } from "./entities/bounding-box.entity";
import { Slide } from "src/slide/entities/slide.entity";

@Module({
    imports: [TypeOrmModule.forFeature([BoundingBox, Slide])],
    providers: [BoundingBoxService],
    exports: [BoundingBoxService],
})
export class BoundingBoxModule {}
