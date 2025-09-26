import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BoundingBox } from "./entities/bounding-box.entity";
import { Slide } from "src/slide/entities/slide.entity";
import { BoundingBoxGateway } from "./bounding-box.gateway";
import { parseWsPayload, pickString } from "src/common/ws.utils";

type BoundingBoxJobName = "updatePosition";

@Processor("boundingBoxes", { concurrency: 20 })
export class BoundingBoxProcessor extends WorkerHost {
    constructor(
        @InjectRepository(BoundingBox)
        private readonly boundingBoxRepository: Repository<BoundingBox>,

        @InjectRepository(Slide)
        private readonly slideRepository: Repository<Slide>,

        private readonly gateway: BoundingBoxGateway,
    ) {
        super();
    }

    private async ensureSlide(slideId: string): Promise<Slide> {
        const slide = await this.slideRepository.findOne({
            where: { id: slideId },
        });
        if (!slide) {
            throw new UnrecoverableError("Slide not found");
        }

        return slide;
    }

    private async requireBoundingBox(
        slideId: string,
        boundingBoxId: string,
    ): Promise<BoundingBox> {
        const boundingBox = await this.boundingBoxRepository.findOne({
            where: { id: boundingBoxId, slideId },
        });

        if (!boundingBox) {
            throw new UnrecoverableError("Bounding box not found");
        }

        return boundingBox;
    }

    private parseJobPayload(
        jobData: unknown,
        errorMessage: string,
    ): Record<string, unknown> {
        const payload = parseWsPayload(jobData);
        if (!payload) {
            throw new UnrecoverableError(errorMessage);
        }

        return payload;
    }

    private pickRequiredString(
        payload: Record<string, unknown>,
        key: string,
        errorMessage: string,
    ): string {
        const value = pickString(payload, key);
        if (!value) {
            throw new UnrecoverableError(errorMessage);
        }

        return value;
    }

    private pickOptionalNumber(
        payload: Record<string, unknown>,
        key: keyof Pick<BoundingBox, "x_pos" | "y_pos" | "x_long" | "y_long">,
    ): number | undefined {
        const value = payload[key];
        if (value === undefined) {
            return undefined;
        }

        if (typeof value !== "number") {
            throw new UnrecoverableError(
                `${String(key)} must be a number if provided`,
            );
        }

        return value;
    }

    private pickOptionalString(
        payload: Record<string, unknown>,
        key: keyof Pick<BoundingBox, "color">,
    ): string | undefined {
        const value = payload[key];
        if (value === undefined) {
            return undefined;
        }

        if (typeof value !== "string") {
            throw new UnrecoverableError(
                `${String(key)} must be a string if provided`,
            );
        }

        return value;
    }

    async process(job: Job<unknown>): Promise<void> {
        switch (job.name as BoundingBoxJobName) {
            case "updatePosition":
                await this.handleUpdatePosition(job);
                return;

            default:
                throw new UnrecoverableError(`Unknown job name: ${job.name}`);
        }
    }

    private async handleUpdatePosition(job: Job<unknown>): Promise<void> {
        const payload = this.parseJobPayload(
            job.data,
            "Invalid updatePosition payload",
        );

        const slideId = this.pickRequiredString(
            payload,
            "slideId",
            "Invalid updatePosition payload",
        );
        const boundingBoxId = this.pickRequiredString(
            payload,
            "boundingBoxId",
            "Invalid updatePosition payload",
        );

        await this.ensureSlide(slideId);

        const boundingBox = await this.requireBoundingBox(
            slideId,
            boundingBoxId,
        );

        const updates: Partial<BoundingBox> = {};
        const numberKeys = ["x_pos", "y_pos", "x_long", "y_long"] as const;
        for (const key of numberKeys) {
            const value = this.pickOptionalNumber(payload, key);
            if (value !== undefined) {
                updates[key] = value;
            }
        }

        const color = this.pickOptionalString(payload, "color");
        if (color !== undefined) {
            updates.color = color;
        }

        if (Object.keys(updates).length === 0) {
            throw new UnrecoverableError("No update fields provided");
        }

        Object.assign(boundingBox, updates);
        const saved = await this.boundingBoxRepository.save(boundingBox);

        this.gateway.server
            .to(`slide:${slideId}`)
            .emit("boundingBoxPositionUpdated", saved);
    }
}
