import {
    SubscribeMessage,
    WebSocketGateway,
    MessageBody,
    ConnectedSocket,
    WsResponse,
    WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Comment } from "./entities/comment.entity";
import { Slide } from "src/slide/entities/slide.entity";

@WebSocketGateway({
    cors: {
        origin: "*",
    },
})
export class CommentGateway {
    @WebSocketServer() server: Server;

    constructor(
        @InjectRepository(Comment)
        private commentRepository: Repository<Comment>,
        @InjectRepository(Slide)
        private slideRepository: Repository<Slide>,
    ) {}

    private handlePayload(payload: unknown): Record<string, unknown> {
        let raw: unknown = payload;
        if (typeof payload === "string") {
            try {
                raw = JSON.parse(payload);
            } catch {
                raw = {};
            }
        }

        if (typeof raw !== "object" || raw === null) {
            return {
                event: "error",
                data: { message: "Invalid payload format" },
            };
        }

        const obj = raw as Record<string, unknown>;
        return obj;
    }

    @SubscribeMessage("joinSlide")
    async handleJoinSlide(
        @MessageBody() payload: unknown,
        @ConnectedSocket() client: Socket,
    ): Promise<WsResponse<any>> {
        const obj = this.handlePayload(payload);
        const slideIdStr = typeof obj.slideId === "string" ? obj.slideId : "";

        if (!slideIdStr) {
            return { event: "error", data: { message: "slideId is required" } };
        }

        await client.join(`slide:${slideIdStr}`);
        return { event: "joined", data: { slideId: slideIdStr } };
    }

    @SubscribeMessage("createComment")
    async handleCreateMessage(
        @MessageBody() payload: unknown,
    ): Promise<WsResponse<Record<string, unknown>>> {
        const obj = this.handlePayload(payload);
        const slideIdStr = typeof obj.slideId === "string" ? obj.slideId : "";
        const userIdStr = typeof obj.userId === "string" ? obj.userId : "";
        const contentStr = typeof obj.content === "string" ? obj.content : "";

        if (!slideIdStr || !userIdStr || !contentStr) {
            return {
                event: "error",
                data: { message: "slideId, userId and content are required" },
            };
        }

        // Ensure the slide exists
        const slide = await this.slideRepository.findOne({
            where: { id: slideIdStr },
        });
        if (!slide) {
            return { event: "error", data: { message: "Slide not found" } };
        }

        const saved = await this.commentRepository.save({
            slideId: slideIdStr,
            userId: userIdStr,
            content: contentStr,
        });

        // Broadcast only to the slide-specific room (no global emits by design)
        this.server.to(`slide:${slideIdStr}`).emit("commentCreated", saved);

        // Respond with a JSON object (validated)
        return {
            event: "message",
            data: {
                id: saved.id,
                slideId: slideIdStr,
                userId: userIdStr,
                content: contentStr,
                createdAt: saved.createdAt,
                updatedAt: saved.updatedAt,
            },
        };
    }

    @SubscribeMessage("updateComment")
    async handleUpdateMessage(
        @MessageBody() payload: unknown,
    ): Promise<WsResponse<Record<string, unknown>>> {
        const obj = this.handlePayload(payload);
        const slideIdStr = typeof obj.slideId === "string" ? obj.slideId : "";
        const userIdStr = typeof obj.userId === "string" ? obj.userId : "";
        const contentStr = typeof obj.content === "string" ? obj.content : "";
        const commentIdStr =
            typeof obj.commentId === "string" ? obj.commentId : "";

        if (!slideIdStr || !userIdStr || !contentStr || !commentIdStr) {
            return {
                event: "error",
                data: {
                    message:
                        "slideId, userId, commentId and content are required",
                },
            };
        }

        // Ensure the slide exists
        const slide = await this.slideRepository.findOne({
            where: { id: slideIdStr },
        });
        if (!slide) {
            return { event: "error", data: { message: "Slide not found" } };
        }

        // Ensure the comment exists and belongs to the slide
        const comment = await this.commentRepository.findOne({
            where: { id: commentIdStr, slideId: slideIdStr },
        });
        if (!comment) {
            return {
                event: "error",
                data: { message: "Comment not found" },
            };
        }

        // Optional authorization: only the creator can update their comment
        if (comment.userId !== userIdStr) {
            return {
                event: "error",
                data: { message: "You can only update your own comment" },
            };
        }

        // Update and persist
        comment.content = contentStr;
        const saved = await this.commentRepository.save(comment);

        // Broadcast only to the slide-specific room (no global emits)
        this.server.to(`slide:${slideIdStr}`).emit("commentUpdated", saved);

        return {
            event: "message",
            data: {
                id: saved.id,
                slideId: saved.slideId,
                userId: saved.userId,
                content: saved.content,
                createdAt: saved.createdAt,
                updatedAt: saved.updatedAt,
            },
        };
    }

    @SubscribeMessage("deleteComment")
    async handleDeleteMessage(
        @MessageBody() payload: unknown,
    ): Promise<WsResponse<Record<string, unknown>>> {
        const obj = this.handlePayload(payload);
        const slideIdStr = typeof obj.slideId === "string" ? obj.slideId : "";
        const userIdStr = typeof obj.userId === "string" ? obj.userId : "";
        const commentIdStr =
            typeof obj.commentId === "string" ? obj.commentId : "";

        if (!slideIdStr || !userIdStr || !commentIdStr) {
            return {
                event: "error",
                data: {
                    message: "slideId, userId and commentId are required",
                },
            };
        }

        // Ensure the slide exists
        const slide = await this.slideRepository.findOne({
            where: { id: slideIdStr },
        });
        if (!slide) {
            return { event: "error", data: { message: "Slide not found" } };
        }

        // Ensure the comment exists and belongs to the slide
        const comment = await this.commentRepository.findOne({
            where: { id: commentIdStr, slideId: slideIdStr },
        });
        if (!comment) {
            return {
                event: "error",
                data: { message: "Comment not found" },
            };
        }

        // Optional authorization: only the creator can delete their comment
        if (comment.userId !== userIdStr) {
            return {
                event: "error",
                data: { message: "You can only delete your own comment" },
            };
        }

        // Delete the comment
        await this.commentRepository.delete(commentIdStr);

        // Broadcast only to the slide-specific room (no global emits)
        this.server
            .to(`slide:${slideIdStr}`)
            .emit("commentDeleted", { id: commentIdStr, slideId: slideIdStr });

        // Respond with a JSON object (validated)
        return {
            event: "message",
            data: {
                deleted: true,
                id: commentIdStr,
                slideId: slideIdStr,
                userId: userIdStr,
            },
        };
    }
}
