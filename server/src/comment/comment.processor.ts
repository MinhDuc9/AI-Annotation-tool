import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Comment } from "./entities/comment.entity";
import { Slide } from "src/slide/entities/slide.entity";
import { CommentGateway } from "./comment.gateway";

export interface CreateCommentPayload {
    slideId: string;
    userId: string;
    content: string;
}

export interface UpdateCommentPayload {
    slideId: string;
    userId: string;
    commentId: string;
    content: string;
}

export interface DeleteCommentPayload {
    slideId: string;
    userId: string;
    commentId: string;
}

export type CommentJobName = "create" | "update" | "delete";

// Type guards for runtime validation & compile-time narrowing
function isCreatePayload(d: unknown): d is CreateCommentPayload {
    const o = d as Record<string, unknown>;
    return (
        typeof o?.slideId === "string" &&
        typeof o?.userId === "string" &&
        typeof o?.content === "string"
    );
}

function isUpdatePayload(d: unknown): d is UpdateCommentPayload {
    const o = d as Record<string, unknown>;
    return (
        typeof o?.slideId === "string" &&
        typeof o?.userId === "string" &&
        typeof o?.commentId === "string" &&
        typeof o?.content === "string"
    );
}

function isDeletePayload(d: unknown): d is DeleteCommentPayload {
    const o = d as Record<string, unknown>;
    return (
        typeof o?.slideId === "string" &&
        typeof o?.userId === "string" &&
        typeof o?.commentId === "string"
    );
}

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
            case "create": {
                const data = job.data;
                if (!isCreatePayload(data))
                    throw new UnrecoverableError("Invalid create payload");

                await this.ensureSlide(data.slideId);

                const saved = await this.commentRepository.save({
                    slideId: data.slideId,
                    userId: data.userId,
                    content: data.content,
                });

                this.gateway.server
                    .to(`slide:${data.slideId}`)
                    .emit("commentCreated", saved);

                return;
            }

            case "update": {
                const data = job.data;
                if (!isUpdatePayload(data))
                    throw new UnrecoverableError("Invalid update payload");

                await this.ensureSlide(data.slideId);

                const comment = await this.commentRepository.findOne({
                    where: { id: data.commentId, slideId: data.slideId },
                });
                if (!comment) {
                    throw new UnrecoverableError("Comment not found");
                }
                if (comment.userId !== data.userId) {
                    throw new UnrecoverableError(
                        "You can only update your own comment",
                    );
                }

                comment.content = data.content;
                const saved = await this.commentRepository.save(comment);

                this.gateway.server
                    .to(`slide:${data.slideId}`)
                    .emit("commentUpdated", saved);

                return;
            }

            case "delete": {
                const data = job.data;
                if (!isDeletePayload(data)) {
                    throw new UnrecoverableError("Invalid delete payload");
                }

                await this.ensureSlide(data.slideId);

                const comment = await this.commentRepository.findOne({
                    where: { id: data.commentId, slideId: data.slideId },
                });

                if (!comment) {
                    throw new UnrecoverableError("Comment not found");
                }

                if (comment.userId !== data.userId) {
                    throw new UnrecoverableError(
                        "You can only delete your own comment",
                    );
                }

                await this.commentRepository.delete(data.commentId);

                this.gateway.server
                    .to(`slide:${data.slideId}`)
                    .emit("commentDeleted", {
                        id: data.commentId,
                        slideId: data.slideId,
                    });

                return;
            }

            default: {
                throw new UnrecoverableError(`Unknown job name: ${job.name}`);
            }
        }
    }
}
