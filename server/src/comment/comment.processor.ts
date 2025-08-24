import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Comment } from "./entities/comment.entity";
import { Slide } from "src/slide/entities/slide.entity";
import { CommentGateway } from "./comment.gateway";

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
        if (!slide) throw new Error("Slide not found");
        return slide;
    }

    async process(job: Job<any>) {
        switch (job.name) {
            case "create": {
                const { slideId, userId, content } = job.data ?? {};

                if (!slideId || !userId || !content)
                    throw new Error("Invalid create payload");

                await this.ensureSlide(slideId);

                const saved = await this.commentRepository.save({
                    slideId,
                    userId,
                    content,
                });

                this.gateway.server
                    .to(`slide:${slideId}`)
                    .emit("commentCreated", saved);

                return {
                    id: saved.id,
                    slideId: saved.slideId,
                    userId: saved.userId,
                    content: saved.content,
                    createdAt: saved.createdAt,
                    updatedAt: saved.updatedAt,
                };
            }

            case "update": {
                const { slideId, userId, commentId, content } = job.data ?? {};

                if (!slideId || !userId || !commentId || !content)
                    throw new Error("Invalid update payload");

                await this.ensureSlide(slideId);

                const comment = await this.commentRepository.findOne({
                    where: { id: commentId, slideId },
                });

                if (!comment) throw new Error("Comment not found");

                if (comment.userId !== userId)
                    throw new Error("You can only update your own comment");

                comment.content = content;
                const saved = await this.commentRepository.save(comment);

                this.gateway.server
                    .to(`slide:${slideId}`)
                    .emit("commentUpdated", saved);

                return {
                    id: saved.id,
                    slideId: saved.slideId,
                    userId: saved.userId,
                    content: saved.content,
                    createdAt: saved.createdAt,
                    updatedAt: saved.updatedAt,
                };
            }

            case "delete": {
                const { slideId, userId, commentId } = job.data ?? {};

                if (!slideId || !userId || !commentId)
                    throw new Error("Invalid delete payload");

                await this.ensureSlide(slideId);

                const comment = await this.commentRepository.findOne({
                    where: { id: commentId, slideId },
                });

                if (!comment) throw new Error("Comment not found");

                if (comment.userId !== userId)
                    throw new Error("You can only delete your own comment");

                await this.commentRepository.delete(commentId);

                this.gateway.server
                    .to(`slide:${slideId}`)
                    .emit("commentDeleted", { id: commentId, slideId });

                return { deleted: true, id: commentId, slideId, userId };
            }

            default: {
                throw new Error(`Unknown job name: ${job.name}`);
            }
        }
    }
}
