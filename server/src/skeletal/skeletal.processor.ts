import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { HttpException } from "@nestjs/common";
import { SkeletalGateway } from "./skeletal.gateway";
import { parseWsPayload, pickString } from "src/common/ws.utils";
import { SkeletalService } from "./skeletal.service";
import { CreateSkeletalDto } from "./dto/create-skeletal.dto";
import { UpdateSkeletalDto } from "./dto/update-skeletal.dto";

type SkeletalJobName = "createSkeletal" | "updateState" | "deleteSkeletal";

@Processor("skeletals", { concurrency: 20 })
export class SkeletalProcessor extends WorkerHost {
    constructor(
        private readonly skeletalService: SkeletalService,
        private readonly gateway: SkeletalGateway,
    ) {
        super();
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
        key: keyof Pick<CreateSkeletalDto, "x_pos" | "y_pos">,
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
        key: keyof Pick<CreateSkeletalDto, "color" | "category">,
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

    private pickRequiredNumber(
        payload: Record<string, unknown>,
        key: keyof Pick<CreateSkeletalDto, "x_pos" | "y_pos">,
    ): number {
        const value = payload[key];
        if (typeof value !== "number") {
            throw new UnrecoverableError(
                `${String(key)} must be provided as a number`,
            );
        }
        return value;
    }

    private pickRequiredNonEmptyString(
        payload: Record<string, unknown>,
        key: keyof Pick<CreateSkeletalDto, "color" | "category">,
    ): string {
        const value = payload[key];
        if (typeof value !== "string" || !value.trim()) {
            throw new UnrecoverableError(
                `${String(key)} must be a non-empty string`,
            );
        }
        return value;
    }

    private mapServiceError(error: unknown): never {
        if (error instanceof HttpException) {
            throw new UnrecoverableError(error.message);
        }
        if (error instanceof UnrecoverableError) {
            throw error;
        }
        throw new UnrecoverableError(
            error instanceof Error ? error.message : "Unknown error",
        );
    }

    async process(job: Job<unknown>): Promise<void> {
        switch (job.name as SkeletalJobName) {
            case "createSkeletal":
                await this.handleCreateSkeletal(job);
                return;
            case "updateState":
                await this.handleUpdateState(job);
                return;
            case "deleteSkeletal":
                await this.handleDeleteSkeletal(job);
                return;

            default:
                throw new UnrecoverableError(`Unknown job name: ${job.name}`);
        }
    }

    private async handleCreateSkeletal(job: Job<unknown>): Promise<void> {
        const payload = this.parseJobPayload(
            job.data,
            "Invalid createSkeletal payload",
        );

        const slideId = this.pickRequiredString(
            payload,
            "slideId",
            "Invalid createSkeletal payload",
        );

        const createDto: CreateSkeletalDto = {
            x_pos: this.pickRequiredNumber(payload, "x_pos"),
            y_pos: this.pickRequiredNumber(payload, "y_pos"),
            key_points: this.pickOptionalKeyPoints(payload) ?? undefined,
            color: this.pickRequiredNonEmptyString(payload, "color"),
            category: this.pickRequiredNonEmptyString(payload, "category"),
        };

        try {
            const saved = await this.skeletalService.create(slideId, createDto);

            this.gateway.server
                .to(`slide:${slideId}`)
                .emit("skeletalCreated", saved);
        } catch (error) {
            this.mapServiceError(error);
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

        const updates: UpdateSkeletalDto = {};

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

        const category = this.pickOptionalString(payload, "category");
        if (category !== undefined) {
            updates.category = category;
        }

        const keyPoints = this.pickOptionalKeyPoints(payload);
        if (keyPoints !== undefined) {
            updates.key_points = keyPoints;
        }

        if (Object.keys(updates).length === 0) {
            throw new UnrecoverableError("No update fields provided");
        }

        try {
            const saved = await this.skeletalService.update(
                skeletalId,
                slideId,
                updates,
            );

            this.gateway.server
                .to(`slide:${slideId}`)
                .emit("skeletalStateUpdated", saved);
        } catch (error) {
            this.mapServiceError(error);
        }
    }

    private async handleDeleteSkeletal(job: Job<unknown>): Promise<void> {
        const payload = this.parseJobPayload(
            job.data,
            "Invalid deleteSkeletal payload",
        );

        const slideId = this.pickRequiredString(
            payload,
            "slideId",
            "Invalid deleteSkeletal payload",
        );
        const skeletalId = this.pickRequiredString(
            payload,
            "skeletalId",
            "Invalid deleteSkeletal payload",
        );

        try {
            await this.skeletalService.remove(skeletalId, slideId);

            this.gateway.server
                .to(`slide:${slideId}`)
                .emit("skeletalDeleted", { skeletalId });
        } catch (error) {
            this.mapServiceError(error);
        }
    }
}
