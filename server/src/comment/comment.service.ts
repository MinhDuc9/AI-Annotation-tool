import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Comment } from "./entities/comment.entity";

@Injectable()
export class CommentService {
    constructor(
        @InjectRepository(Comment)
        private readonly commentRepository: Repository<Comment>,
    ) {}

    async findAll(slideId: string): Promise<Comment[]> {
        return await this.commentRepository.find({
            where: { slideId },
            order: { createdAt: "DESC" },
        });
    }
}
