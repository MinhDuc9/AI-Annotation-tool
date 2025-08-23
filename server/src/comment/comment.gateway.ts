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
        private commentRepo: Repository<Comment>,
        @InjectRepository(Slide)
        private slideRepo: Repository<Slide>,
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
    async handleMessage(
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
        const slide = await this.slideRepo.findOne({
            where: { id: slideIdStr },
        });
        if (!slide) {
            return { event: "error", data: { message: "Slide not found" } };
        }

        const saved = await this.commentRepo.save({
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
                slideId: slideIdStr,
                userId: userIdStr,
                content: contentStr,
            },
        };
    }
}
