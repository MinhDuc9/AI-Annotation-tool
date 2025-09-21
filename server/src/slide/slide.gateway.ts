import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    WsResponse,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { parseWsPayload, pickString } from "src/common/ws.utils";

@WebSocketGateway({
    cors: {
        origin: "*",
    },
})
export class SlideGateway {
    @WebSocketServer() server: Server;

    @SubscribeMessage("joinSlide")
    async handleJoinSlide(
        @MessageBody() payload: unknown,
        @ConnectedSocket() client: Socket,
    ): Promise<WsResponse<Record<string, string>>> {
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

        await client.join(`slide:${slideId}`);

        return { event: "joined", data: { slideId } };
    }
}
