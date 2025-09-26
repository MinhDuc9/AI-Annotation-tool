import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Skeletal } from "./entities/skeletal.entity";
import { Slide } from "src/slide/entities/slide.entity";
import { SkeletalGateway } from "./skeletal.gateway";
import { parseWsPayload, pickString } from "src/common/ws.utils";

type SkeletalJobName = "updateState";

@Processor("skeletals", { concurrency: 20 })
export class SkeletalProcessor extends WorkerHost {
    constructor(
        @InjectRepository(Skeletal)
        private readonly skeletalRepository: Repository<Skeletal>,

        @InjectRepository(Slide)
        private readonly slideRepository: Repository<Slide>,

        private readonly gateway: SkeletalGateway,
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

    private async requireSkeletal(
        slideId: string,
        skeletalId: string,
    ): Promise<Skeletal> {
        const skeletal = await this.skeletalRepository.findOne({
            where: { id: skeletalId, slideId },
        });

        if (!skeletal) {
            throw new UnrecoverableError("Skeletal not found");
        }

        return skeletal;
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
        key: keyof Pick<Skeletal, "x_pos" | "y_pos">,
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
        key: keyof Pick<Skeletal, "color">,
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

    private pickOptionalKeyPoints(
        payload: Record<string, unknown>,
    ): string[] | null | undefined {
        if (!Object.prototype.hasOwnProperty.call(payload, "key_points")) {
            return undefined;
        }

        const value = payload.key_points;

        if (value === null) {
            return null;
        }

        if (!Array.isArray(value)) {
            throw new UnrecoverableError(
                "key_points must be null or an array of strings if provided",
            );
        }

        if (value.some((kp) => typeof kp !== "string")) {
            throw new UnrecoverableError(
                "key_points must be null or an array of strings if provided",
            );
        }

        return value.length > 0 ? (value as string[]) : null;
    }

    async process(job: Job<unknown>): Promise<void> {
        switch (job.name as SkeletalJobName) {
            case "updateState":
                await this.handleUpdateState(job);
                return;

            default:
                throw new UnrecoverableError(`Unknown job name: ${job.name}`);
        }
    }

    private async handleUpdateState(job: Job<unknown>): Promise<void> {
        const payload = this.parseJobPayload(
            job.data,
            "Invalid updateState payload",
        );

        const slideId = this.pickRequiredString(
            payload,
            "slideId",
            "Invalid updateState payload",
        );
        const skeletalId = this.pickRequiredString(
            payload,
            "skeletalId",
            "Invalid updateState payload",
        );

        await this.ensureSlide(slideId);

        const skeletal = await this.requireSkeletal(slideId, skeletalId);

        const updates: Partial<Skeletal> = {};

        const numberKeys = ["x_pos", "y_pos"] as const;
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

        const keyPoints = this.pickOptionalKeyPoints(payload);
        if (keyPoints !== undefined) {
            updates.key_points = keyPoints;
        }

        if (Object.keys(updates).length === 0) {
            throw new UnrecoverableError("No update fields provided");
        }

        Object.assign(skeletal, updates);
        const saved = await this.skeletalRepository.save(skeletal);

        this.gateway.server
            .to(`slide:${slideId}`)
            .emit("skeletalStateUpdated", saved);
    }
}
