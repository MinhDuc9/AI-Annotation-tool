import { Module } from "@nestjs/common";
import { CommentGateway } from "./comment.gateway";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Slide } from "src/slide/entities/slide.entity";
import { Comment } from "./entities/comment.entity";
import { CommentService } from "./comment.service";
import { BullModule } from "@nestjs/bullmq";
import { CommentsProcessor } from "./comment.processor";

@Module({
    imports: [
        TypeOrmModule.forFeature([Comment, Slide]),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        BullModule.registerQueue({
            name: "comments",
            defaultJobOptions: {
                attempts: 5,
                backoff: { type: "fixed", delay: 60 * 30 * 1000 }, // retry every 30 min
                removeOnComplete: true, // remove successful jobs immediately
                removeOnFail: { age: 60 * 60 }, // keep failed jobs for 1h
            },
        }),
    ],
    providers: [CommentGateway, CommentService, CommentsProcessor],
    exports: [CommentService],
})
export class CommentModule {}
