import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AiMicroserviceService } from "./ai-microservice.service";
import { AiMicroserviceController } from "./ai-microservice.controller";
import { Slide } from "src/slide/entities/slide.entity";
import { BoundingBox } from "src/bounding-box/entities/bounding-box.entity";
import { Skeletal } from "src/skeletal/entities/skeletal.entity";

@Module({
    imports: [TypeOrmModule.forFeature([Slide, BoundingBox, Skeletal])],
    controllers: [AiMicroserviceController],
    providers: [AiMicroserviceService],
})
export class AiMicroserviceModule {}
