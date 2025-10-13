import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BoundingBoxService } from "./bounding-box.service";
import { BoundingBox } from "./entities/bounding-box.entity";
import { Slide } from "../slide/entities/slide.entity";
import { BoundingBoxGateway } from "./bounding-box.gateway";
import { BullModule } from "@nestjs/bullmq";
import { BoundingBoxProcessor } from "./bounding-box.processor";

@Module({
    imports: [
        TypeOrmModule.forFeature([BoundingBox, Slide]),
        BullModule.registerQueue({
            name: "boundingBoxes",
            defaultJobOptions: {
                attempts: 5,
                backoff: { type: "fixed", delay: 60 * 30 * 1000 },
                removeOnComplete: true,
                removeOnFail: { age: 60 * 60 },
            },
        }),
    ],
    providers: [BoundingBoxService, BoundingBoxGateway, BoundingBoxProcessor],
    exports: [BoundingBoxService],
})
export class BoundingBoxModule {}
