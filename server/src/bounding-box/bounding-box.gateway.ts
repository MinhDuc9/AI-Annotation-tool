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
import { CreateBoundingBoxDto } from "./dto/create-bounding-box.dto";

@WebSocketGateway({
    cors: {
        origin: "*",
    },
})
export class BoundingBoxGateway {
    @WebSocketServer() server: Server;

    constructor(
        @InjectQueue("boundingBoxes")
        private readonly boundingBoxesQueue: Queue,
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

        client.broadcast.to(`slide:${slideId}`).emit("onTouch", obj);

        return {
            event: "broadcasted",
            data: { action: "onTouch", slideId },
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

        client.broadcast.to(`slide:${slideId}`).emit("unTouch", obj);

        return {
            event: "broadcasted",
            data: { action: "unTouch", slideId },
        };
    }

    @SubscribeMessage("updatePosition")
    async handleUpdatePosition(
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
        const boundingBoxId = pickString(obj, "boundingBoxId");

        if (!slideId || !boundingBoxId) {
            return {
                event: "error",
                data: {
                    message: "slideId and boundingBoxId are required",
                },
            };
        }

        const updatePayload: Record<string, unknown> = {
            slideId,
            boundingBoxId,
        };

        let hasUpdate = false;

        const numericKeys = ["x_pos", "y_pos", "x_long", "y_long"] as const;
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

        if (!hasUpdate) {
            return {
                event: "error",
                data: { message: "At least one updatable field is required" },
            };
        }

        await this.boundingBoxesQueue.add("updatePosition", updatePayload);

        return {
            event: "queued",
            data: { action: "updatePosition", slideId, boundingBoxId },
        };
    }

    @SubscribeMessage("createBoundingBox")
    async handleCreateBoundingBox(
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

        const numericKeys: Array<keyof CreateBoundingBoxDto> = [
            "x_pos",
            "y_pos",
            "x_long",
            "y_long",
        ];

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

        const requiredStrings: Array<keyof CreateBoundingBoxDto> = [
            "color",
            "category",
        ];

        for (const key of requiredStrings) {
            const value = obj[key];
            if (typeof value !== "string" || !value.trim()) {
                return {
                    event: "error",
                    data: {
                        message: `${String(key)} must be a non-empty string`,
                    },
                };
            }
            createPayload[key] = value;
        }

        await this.boundingBoxesQueue.add("createBoundingBox", createPayload);

        return {
            event: "queued",
            data: { action: "createBoundingBox", slideId },
        };
    }

    @SubscribeMessage("deleteBoundingBox")
    async handleDeleteBoundingBox(
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
        const boundingBoxId = pickString(obj, "boundingBoxId");

        if (!slideId || !boundingBoxId) {
            return {
                event: "error",
                data: {
                    message: "slideId and boundingBoxId are required",
                },
            };
        }

        await this.boundingBoxesQueue.add("deleteBoundingBox", {
            slideId,
            boundingBoxId,
        });

        return {
            event: "queued",
            data: { action: "deleteBoundingBox", slideId, boundingBoxId },
        };
    }
}
