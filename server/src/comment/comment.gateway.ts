import {
    SubscribeMessage,
    WebSocketGateway,
    MessageBody,
    WsResponse,
    WebSocketServer,
} from "@nestjs/websockets";
import { Server } from "socket.io";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { parseWsPayload, pickString } from "src/common/ws.utils";

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

    @SubscribeMessage("createComment")
    async handleCreateMessage(
        @MessageBody() payload: unknown,
    ): Promise<WsResponse<Record<string, unknown>>> {
        const obj = parseWsPayload(payload);
        if (!obj) {
            return {
                event: "error",
                data: { message: "Invalid payload format" },
            };
        }

        const slideIdStr = pickString(obj, "slideId");
        const userIdStr = pickString(obj, "userId");
        const contentStr = pickString(obj, "content");

        if (!slideIdStr || !userIdStr || !contentStr) {
            return {
                event: "error",
                data: { message: "slideId, userId and content are required" },
            };
        }

        await this.commentsQueue.add("create", {
            slideId: slideIdStr,
            userId: userIdStr,
            content: contentStr,
        });

        return {
            event: "queued",
            data: { action: "create", slideId: slideIdStr },
        };
    }

    @SubscribeMessage("updateComment")
    async handleUpdateMessage(
        @MessageBody() payload: unknown,
    ): Promise<WsResponse<Record<string, unknown>>> {
        const obj = parseWsPayload(payload);
        if (!obj) {
            return {
                event: "error",
                data: { message: "Invalid payload format" },
            };
        }

        const slideIdStr = pickString(obj, "slideId");
        const userIdStr = pickString(obj, "userId");
        const contentStr = pickString(obj, "content");
        const commentIdStr = pickString(obj, "commentId");

        if (!slideIdStr || !userIdStr || !contentStr || !commentIdStr) {
            return {
                event: "error",
                data: {
                    message:
                        "slideId, userId, commentId and content are required",
                },
            };
        }

        await this.commentsQueue.add("update", {
            slideId: slideIdStr,
            userId: userIdStr,
            commentId: commentIdStr,
            content: contentStr,
        });

        return {
            event: "queued",
            data: {
                action: "update",
                slideId: slideIdStr,
                commentId: commentIdStr,
            },
        };
    }

    @SubscribeMessage("deleteComment")
    async handleDeleteMessage(
        @MessageBody() payload: unknown,
    ): Promise<WsResponse<Record<string, unknown>>> {
        const obj = parseWsPayload(payload);
        if (!obj) {
            return {
                event: "error",
                data: { message: "Invalid payload format" },
            };
        }

        const slideIdStr = pickString(obj, "slideId");
        const userIdStr = pickString(obj, "userId");
        const commentIdStr = pickString(obj, "commentId");

        if (!slideIdStr || !userIdStr || !commentIdStr) {
            return {
                event: "error",
                data: {
                    message: "slideId, userId and commentId are required",
                },
            };
        }

        await this.commentsQueue.add("delete", {
            slideId: slideIdStr,
            userId: userIdStr,
            commentId: commentIdStr,
        });

        return {
            event: "queued",
            data: {
                action: "delete",
                slideId: slideIdStr,
                commentId: commentIdStr,
            },
        };
    }
}
