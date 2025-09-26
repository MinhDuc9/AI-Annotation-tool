import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    WsResponse,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { parseWsPayload, pickString } from "src/common/ws.utils";

@WebSocketGateway({
    cors: {
        origin: "*",
    },
})
export class SkeletalGateway {
    @WebSocketServer() server: Server;

    constructor(
        @InjectQueue("skeletals")
        private readonly skeletalsQueue: Queue,
    ) {}

    @SubscribeMessage("onTouch")
    handleOnTouch(
        @MessageBody() payload: unknown,
        @ConnectedSocket() client: Socket,
    ): WsResponse<Record<string, unknown>> {
        const obj = parseWsPayload(payload);
        if (!obj) {
            return {
                event: "error",
                data: { message: "Invalid payload format" },
            };
        }

        const slideId = pickString(obj, "slideId");
        if (!slideId) {
            return {
                event: "error",
                data: { message: "slideId is required" },
            };
        }

        client.broadcast.to(`slide:${slideId}`).emit("skeletalOnTouch", obj);

        return {
            event: "broadcasted",
            data: { action: "skeletalOnTouch", slideId },
        };
    }

    @SubscribeMessage("unTouch")
    handleUnTouch(
        @MessageBody() payload: unknown,
        @ConnectedSocket() client: Socket,
    ): WsResponse<Record<string, unknown>> {
        const obj = parseWsPayload(payload);
        if (!obj) {
            return {
                event: "error",
                data: { message: "Invalid payload format" },
            };
        }

        const slideId = pickString(obj, "slideId");
        if (!slideId) {
            return {
                event: "error",
                data: { message: "slideId is required" },
            };
        }

        client.broadcast.to(`slide:${slideId}`).emit("skeletalUnTouch", obj);

        return {
            event: "broadcasted",
            data: { action: "skeletalUnTouch", slideId },
        };
    }

    @SubscribeMessage("updateState")
    async handleUpdateState(
        @MessageBody() payload: unknown,
    ): Promise<WsResponse<Record<string, unknown>>> {
        const obj = parseWsPayload(payload);
        if (!obj) {
            return {
                event: "error",
                data: { message: "Invalid payload format" },
            };
        }

        const slideId = pickString(obj, "slideId");
        const skeletalId = pickString(obj, "skeletalId");

        if (!slideId || !skeletalId) {
            return {
                event: "error",
                data: {
                    message: "slideId and skeletalId are required",
                },
            };
        }

        const updatePayload: Record<string, unknown> = {
            slideId,
            skeletalId,
        };

        let hasUpdate = false;

        const numericKeys = ["x_pos", "y_pos"] as const;
        for (const key of numericKeys) {
            if (obj[key] === undefined) {
                continue;
            }

            if (typeof obj[key] !== "number") {
                return {
                    event: "error",
                    data: { message: `${key} must be a number if provided` },
                };
            }

            updatePayload[key] = obj[key];
            hasUpdate = true;
        }

        if (obj.color !== undefined) {
            if (typeof obj.color !== "string") {
                return {
                    event: "error",
                    data: { message: "color must be a string if provided" },
                };
            }

            updatePayload.color = obj.color;
            hasUpdate = true;
        }

        if (obj.key_points !== undefined) {
            if (
                obj.key_points !== null &&
                (!Array.isArray(obj.key_points) ||
                    obj.key_points.some((kp) => typeof kp !== "string"))
            ) {
                return {
                    event: "error",
                    data: {
                        message:
                            "key_points must be null or an array of strings if provided",
                    },
                };
            }

            updatePayload.key_points = obj.key_points;
            hasUpdate = true;
        }

        if (!hasUpdate) {
            return {
                event: "error",
                data: { message: "At least one updatable field is required" },
            };
        }

        await this.skeletalsQueue.add("updateState", updatePayload);

        return {
            event: "queued",
            data: { action: "updateState", slideId, skeletalId },
        };
    }
}
