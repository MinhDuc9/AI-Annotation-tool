import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { HttpException } from "@nestjs/common";
import { BoundingBoxGateway } from "./bounding-box.gateway";
import { parseWsPayload, pickString } from "src/common/ws.utils";
import { BoundingBoxService } from "./bounding-box.service";
import { CreateBoundingBoxDto } from "./dto/create-bounding-box.dto";
import { UpdateBoundingBoxDto } from "./dto/update-bounding-box.dto";

type BoundingBoxJobName =
    | "createBoundingBox"
    | "updatePosition"
    | "deleteBoundingBox";

@Processor("boundingBoxes", { concurrency: 20 })
export class BoundingBoxProcessor extends WorkerHost {
    constructor(
        private readonly boundingBoxService: BoundingBoxService,
        private readonly gateway: BoundingBoxGateway,
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
        key: keyof Pick<
            CreateBoundingBoxDto,
            "x_pos" | "y_pos" | "x_long" | "y_long"
        >,
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
        key: keyof Pick<CreateBoundingBoxDto, "color" | "category">,
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

    private pickRequiredNumber(
        payload: Record<string, unknown>,
        key: keyof CreateBoundingBoxDto,
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
        key: keyof CreateBoundingBoxDto,
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
        throw error;
    }

    async process(job: Job<unknown>): Promise<void> {
        switch (job.name as BoundingBoxJobName) {
            case "createBoundingBox":
                await this.handleCreateBoundingBox(job);
                return;
            case "updatePosition":
                await this.handleUpdatePosition(job);
                return;
            case "deleteBoundingBox":
                await this.handleDeleteBoundingBox(job);
                return;

            default:
                throw new UnrecoverableError(`Unknown job name: ${job.name}`);
        }
    }

    private async handleCreateBoundingBox(job: Job<unknown>): Promise<void> {
        const payload = this.parseJobPayload(
            job.data,
            "Invalid createBoundingBox payload",
        );

        const slideId = this.pickRequiredString(
            payload,
            "slideId",
            "Invalid createBoundingBox payload",
        );

        try {
            const createDto: CreateBoundingBoxDto = {
                x_pos: this.pickRequiredNumber(payload, "x_pos"),
                y_pos: this.pickRequiredNumber(payload, "y_pos"),
                x_long: this.pickRequiredNumber(payload, "x_long"),
                y_long: this.pickRequiredNumber(payload, "y_long"),
                color: this.pickRequiredNonEmptyString(payload, "color"),
                category: this.pickRequiredNonEmptyString(payload, "category"),
            };

            const saved = await this.boundingBoxService.create(
                slideId,
                createDto,
            );

            this.gateway.server
                .to(`slide:${slideId}`)
                .emit("boundingBoxCreated", saved);
        } catch (error) {
            this.mapServiceError(error);
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

        const updateDto: UpdateBoundingBoxDto = {};
        let hasUpdate = false;

        const numberKeys = ["x_pos", "y_pos", "x_long", "y_long"] as const;
        for (const key of numberKeys) {
            const value = this.pickOptionalNumber(payload, key);
            if (value !== undefined) {
                updateDto[key] = value;
                hasUpdate = true;
            }
        }

        const color = this.pickOptionalString(payload, "color");
        if (color !== undefined) {
            updateDto.color = color;
            hasUpdate = true;
        }

        const category = this.pickOptionalString(payload, "category");
        if (category !== undefined) {
            updateDto.category = category;
            hasUpdate = true;
        }

        if (!hasUpdate) {
            throw new UnrecoverableError("No update fields provided");
        }

        try {
            const saved = await this.boundingBoxService.update(
                boundingBoxId,
                slideId,
                updateDto,
            );

            this.gateway.server
                .to(`slide:${slideId}`)
                .emit("boundingBoxPositionUpdated", saved);
        } catch (error) {
            this.mapServiceError(error);
        }
    }

    private async handleDeleteBoundingBox(job: Job<unknown>): Promise<void> {
        const payload = this.parseJobPayload(
            job.data,
            "Invalid deleteBoundingBox payload",
        );

        const slideId = this.pickRequiredString(
            payload,
            "slideId",
            "Invalid deleteBoundingBox payload",
        );
        const boundingBoxId = this.pickRequiredString(
            payload,
            "boundingBoxId",
            "Invalid deleteBoundingBox payload",
        );

        try {
            await this.boundingBoxService.remove(boundingBoxId, slideId);

            this.gateway.server
                .to(`slide:${slideId}`)
                .emit("boundingBoxDeleted", { boundingBoxId });
        } catch (error) {
            this.mapServiceError(error);
        }
    }
}
