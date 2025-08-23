import { Module } from "@nestjs/common";
import { CommentGateway } from "./comment.gateway";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Slide } from "src/slide/entities/slide.entity";
import { Comment } from "./entities/comment.entity";
import { CommentService } from "./comment.service";

@Module({
    imports: [TypeOrmModule.forFeature([Comment, Slide])],
    providers: [CommentGateway, CommentService],
    exports: [CommentService],
})
export class CommentModule {}
