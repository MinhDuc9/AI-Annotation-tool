import { Module } from "@nestjs/common";
import { SkeletalService } from "./skeletal.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Skeletal } from "./entities/skeletal.entity";
import { Slide } from "src/slide/entities/slide.entity";

@Module({
    imports: [TypeOrmModule.forFeature([Skeletal, Slide])],
    providers: [SkeletalService],
    exports: [SkeletalService],
})
export class SkeletalModule {}
