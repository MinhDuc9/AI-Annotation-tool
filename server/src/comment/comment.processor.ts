import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
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

export type CommentJobDataMap = {
    create: CreateCommentPayload;
    update: UpdateCommentPayload;
    delete: DeleteCommentPayload;
};

export interface CommentOutDTO {
    id: string;
    slideId: string;
    userId: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
}

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

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
@Processor("comments", { concurrency: 20 })
export class CommentsProcessor extends WorkerHost {
    constructor(
        @InjectRepository(Comment)
        private readonly commentRepository: Repository<Comment>,

        @InjectRepository(Slide)
        private readonly slideRepository: Repository<Slide>,

        private readonly gateway: CommentGateway,
    ) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        super();
    }

    private async ensureSlide(slideId: string): Promise<Slide> {
        const slide = await this.slideRepository.findOne({
            where: { id: slideId },
        });

        if (!slide) {
            throw new Error("Slide not found");
        }

        return slide;
    }

    async process(job: Job<unknown>) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        switch (job.name as CommentJobName) {
            case "create": {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                const data = job.data;
                if (!isCreatePayload(data))
                    throw new Error("Invalid create payload");

                await this.ensureSlide(data.slideId);

                const saved = await this.commentRepository.save({
                    slideId: data.slideId,
                    userId: data.userId,
                    content: data.content,
                });

                this.gateway.server
                    .to(`slide:${data.slideId}`)
                    .emit("commentCreated", saved);

                const out: CommentOutDTO = {
                    id: saved.id,
                    slideId: saved.slideId,
                    userId: saved.userId,
                    content: saved.content,
                    createdAt: saved.createdAt,
                    updatedAt: saved.updatedAt,
                };
                return out;
            }

            case "update": {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                const data = job.data;
                if (!isUpdatePayload(data))
                    throw new Error("Invalid update payload");

                await this.ensureSlide(data.slideId);

                const comment = await this.commentRepository.findOne({
                    where: { id: data.commentId, slideId: data.slideId },
                });
                if (!comment) {
                    throw new Error("Comment not found");
                }
                if (comment.userId !== data.userId) {
                    throw new Error("You can only update your own comment");
                }

                comment.content = data.content;
                const saved = await this.commentRepository.save(comment);

                this.gateway.server
                    .to(`slide:${data.slideId}`)
                    .emit("commentUpdated", saved);

                const out: CommentOutDTO = {
                    id: saved.id,
                    slideId: saved.slideId,
                    userId: saved.userId,
                    content: saved.content,
                    createdAt: saved.createdAt,
                    updatedAt: saved.updatedAt,
                };

                return out;
            }

            case "delete": {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                const data = job.data;
                if (!isDeletePayload(data)) {
                    throw new Error("Invalid delete payload");
                }

                await this.ensureSlide(data.slideId);

                const comment = await this.commentRepository.findOne({
                    where: { id: data.commentId, slideId: data.slideId },
                });

                if (!comment) {
                    throw new Error("Comment not found");
                }

                if (comment.userId !== data.userId) {
                    throw new Error("You can only delete your own comment");
                }

                await this.commentRepository.delete(data.commentId);

                this.gateway.server
                    .to(`slide:${data.slideId}`)
                    .emit("commentDeleted", {
                        id: data.commentId,
                        slideId: data.slideId,
                    });

                return {
                    deleted: true as const,
                    id: data.commentId,
                    slideId: data.slideId,
                    userId: data.userId,
                };
            }

            default: {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                throw new Error(`Unknown job name: ${job.name}`);
            }
        }
    }
}
