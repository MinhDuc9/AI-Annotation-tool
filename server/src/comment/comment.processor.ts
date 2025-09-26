import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Comment } from "./entities/comment.entity";
import { Slide } from "src/slide/entities/slide.entity";
import { CommentGateway } from "./comment.gateway";
import { parseWsPayload, pickString } from "src/common/ws.utils";

export type CommentJobName = "create" | "update" | "delete";

@Processor("comments", { concurrency: 20 })
export class CommentsProcessor extends WorkerHost {
    constructor(
        @InjectRepository(Comment)
        private readonly commentRepository: Repository<Comment>,

        @InjectRepository(Slide)
        private readonly slideRepository: Repository<Slide>,

        private readonly gateway: CommentGateway,
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

    async process(job: Job<unknown>) {
        switch (job.name as CommentJobName) {
            case "create":
                await this.handleCreate(job);
                return;

            case "update":
                await this.handleUpdate(job);
                return;

            case "delete":
                await this.handleDelete(job);
                return;

            default:
                throw new UnrecoverableError(`Unknown job name: ${job.name}`);
        }
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
        if (typeof payload[key] !== "string") {
            throw new UnrecoverableError(errorMessage);
        }

        return pickString(payload, key);
    }

    private async requireComment(
        slideId: string,
        commentId: string,
    ): Promise<Comment> {
        const comment = await this.commentRepository.findOne({
            where: { id: commentId, slideId },
        });

        if (!comment) {
            throw new UnrecoverableError("Comment not found");
        }

        return comment;
    }

    private async handleCreate(job: Job<unknown>): Promise<void> {
        const payload = this.parseJobPayload(
            job.data,
            "Invalid create payload",
        );

        const slideId = this.pickRequiredString(
            payload,
            "slideId",
            "Invalid create payload",
        );
        const userId = this.pickRequiredString(
            payload,
            "userId",
            "Invalid create payload",
        );
        const content = this.pickRequiredString(
            payload,
            "content",
            "Invalid create payload",
        );

        await this.ensureSlide(slideId);

        const saved = await this.commentRepository.save({
            slideId,
            userId,
            content,
        });

        this.gateway.server
            .to(`slide:${slideId}`)
            .emit("commentCreated", saved);
    }

    private async handleUpdate(job: Job<unknown>): Promise<void> {
        const payload = this.parseJobPayload(
            job.data,
            "Invalid update payload",
        );

        const slideId = this.pickRequiredString(
            payload,
            "slideId",
            "Invalid update payload",
        );
        const userId = this.pickRequiredString(
            payload,
            "userId",
            "Invalid update payload",
        );
        const commentId = this.pickRequiredString(
            payload,
            "commentId",
            "Invalid update payload",
        );
        const content = this.pickRequiredString(
            payload,
            "content",
            "Invalid update payload",
        );

        await this.ensureSlide(slideId);

        const comment = await this.requireComment(slideId, commentId);

        if (comment.userId !== userId) {
            throw new UnrecoverableError(
                "You can only update your own comment",
            );
        }

        comment.content = content;
        const saved = await this.commentRepository.save(comment);

        this.gateway.server
            .to(`slide:${slideId}`)
            .emit("commentUpdated", saved);
    }

    private async handleDelete(job: Job<unknown>): Promise<void> {
        const payload = this.parseJobPayload(
            job.data,
            "Invalid delete payload",
        );

        const slideId = this.pickRequiredString(
            payload,
            "slideId",
            "Invalid delete payload",
        );
        const userId = this.pickRequiredString(
            payload,
            "userId",
            "Invalid delete payload",
        );
        const commentId = this.pickRequiredString(
            payload,
            "commentId",
            "Invalid delete payload",
        );

        await this.ensureSlide(slideId);

        const comment = await this.requireComment(slideId, commentId);

        if (comment.userId !== userId) {
            throw new UnrecoverableError(
                "You can only delete your own comment",
            );
        }

        await this.commentRepository.delete(commentId);

        this.gateway.server.to(`slide:${slideId}`).emit("commentDeleted", {
            id: commentId,
            slideId,
        });
    }
}
