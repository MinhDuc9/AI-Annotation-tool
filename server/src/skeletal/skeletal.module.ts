import { Module } from "@nestjs/common";
import { SkeletalService } from "./skeletal.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Skeletal } from "./entities/skeletal.entity";
import { Slide } from "src/slide/entities/slide.entity";
import { SkeletalGateway } from "./skeletal.gateway";
import { BullModule } from "@nestjs/bullmq";
import { SkeletalProcessor } from "./skeletal.processor";

@Module({
    imports: [
        TypeOrmModule.forFeature([Skeletal, Slide]),
        BullModule.registerQueue({
            name: "skeletals",
            defaultJobOptions: {
                attempts: 5,
                backoff: { type: "fixed", delay: 60 * 30 * 1000 },
                removeOnComplete: true,
                removeOnFail: { age: 60 * 60 },
            },
        }),
    ],
    providers: [SkeletalService, SkeletalGateway, SkeletalProcessor],
    exports: [SkeletalService],
})
export class SkeletalModule {}
