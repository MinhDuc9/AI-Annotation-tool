import { Module } from "@nestjs/common";
import { SkeletalService } from "./skeletal.service";
import { SkeletalController } from "./skeletal.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Skeletal } from "./entities/skeletal.entity";
import { Slide } from "src/slide/entities/slide.entity";

@Module({
    imports: [TypeOrmModule.forFeature([Skeletal, Slide])],
    controllers: [SkeletalController],
    providers: [SkeletalService],
})
export class SkeletalModule {}
