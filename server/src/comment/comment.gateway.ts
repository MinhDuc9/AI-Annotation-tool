import {
    SubscribeMessage,
    WebSocketGateway,
    MessageBody,
    ConnectedSocket,
    WsResponse,
    WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

@WebSocketGateway({
    cors: {
        origin: "*",
    },
})
export class CommentGateway {
    @WebSocketServer() server: Server;

    constructor(
        @InjectQueue("comments")
        private readonly commentsQueue: Queue,
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

    @SubscribeMessage("message")
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

    @SubscribeMessage("message")
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

        const job = await this.commentsQueue.add("create", {
            slideId: slideIdStr,
            userId: userIdStr,
            content: contentStr,
        });

        return {
            event: "queued",
            data: { action: "create", jobId: job.id, slideId: slideIdStr },
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

        const job = await this.commentsQueue.add("update", {
            slideId: slideIdStr,
            userId: userIdStr,
            commentId: commentIdStr,
            content: contentStr,
        });

        return {
            event: "queued",
            data: {
                action: "update",
                jobId: job.id,
                slideId: slideIdStr,
                commentId: commentIdStr,
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

        const job = await this.commentsQueue.add("delete", {
            slideId: slideIdStr,
            userId: userIdStr,
            commentId: commentIdStr,
        });

        return {
            event: "queued",
            data: {
                action: "delete",
                jobId: job.id,
                slideId: slideIdStr,
                commentId: commentIdStr,
            },
        };
    }
}
