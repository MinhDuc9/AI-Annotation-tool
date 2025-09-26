import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AiMicroserviceService } from "./ai-microservice.service";
import { AiMicroserviceController } from "./ai-microservice.controller";
import { Slide } from "src/slide/entities/slide.entity";

@Module({
    imports: [TypeOrmModule.forFeature([Slide])],
    controllers: [AiMicroserviceController],
    providers: [AiMicroserviceService],
})
export class AiMicroserviceModule {}
