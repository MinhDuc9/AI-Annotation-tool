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
import { parseWsPayload, pickString } from "../common/ws.utils";
import { CreateSkeletalDto } from "./dto/create-skeletal.dto";

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

    @SubscribeMessage("skeletalOnTouch")
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

    @SubscribeMessage("skeletalUnTouch")
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

        if (obj.category !== undefined) {
            if (typeof obj.category !== "string") {
                return {
                    event: "error",
                    data: { message: "category must be a string if provided" },
                };
            }

            updatePayload.category = obj.category;
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

    @SubscribeMessage("createSkeletal")
    async handleCreateSkeletal(
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
        if (!slideId) {
            return {
                event: "error",
                data: { message: "slideId is required" },
            };
        }

        const numericKeys: Array<keyof CreateSkeletalDto> = ["x_pos", "y_pos"];

        const createPayload: Record<string, unknown> = { slideId };
        for (const key of numericKeys) {
            const value = obj[key];
            if (typeof value !== "number") {
                return {
                    event: "error",
                    data: { message: `${String(key)} must be a number` },
                };
            }
            createPayload[key] = value;
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
            createPayload.key_points = obj.key_points;
        }

        const color = obj.color;
        if (typeof color !== "string" || !color.trim()) {
            return {
                event: "error",
                data: { message: "color must be a non-empty string" },
            };
        }
        createPayload.color = color;

        const category = obj.category;
        if (typeof category !== "string" || !category.trim()) {
            return {
                event: "error",
                data: { message: "category must be a non-empty string" },
            };
        }
        createPayload.category = category;

        await this.skeletalsQueue.add("createSkeletal", createPayload);

        return {
            event: "queued",
            data: { action: "createSkeletal", slideId },
        };
    }

    @SubscribeMessage("deleteSkeletal")
    async handleDeleteSkeletal(
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
                data: { message: "slideId and skeletalId are required" },
            };
        }

        await this.skeletalsQueue.add("deleteSkeletal", {
            slideId,
            skeletalId,
        });

        return {
            event: "queued",
            data: { action: "deleteSkeletal", slideId, skeletalId },
        };
    }
}
