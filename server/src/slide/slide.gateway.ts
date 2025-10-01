import {
    ConnectedSocket,
    MessageBody,
    OnGatewayDisconnect,
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
export class SlideGateway implements OnGatewayDisconnect {
    @WebSocketServer() server: Server;

    // Track active collaborators per slide (slideId -> socketId -> participant)
    private readonly slideParticipants = new Map<
        string,
        Map<string, SlideParticipant>
    >();

    // Track slides joined by each socket to simplify cleanup on disconnect
    private readonly socketSlides = new Map<string, Set<string>>();

    @SubscribeMessage("joinSlide")
    async handleJoinSlide(
        @MessageBody() payload: unknown,
        @ConnectedSocket() client: Socket,
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

        const userId = pickString(obj, "userId");
        if (!userId) {
            return {
                event: "error",
                data: { message: "userId is required" },
            };
        }

        const userName = pickString(obj, "userName") || undefined;

        await client.join(`slide:${slideId}`);

        const participants = this.getOrCreateParticipants(slideId);

        const participant: SlideParticipant = {
            socketId: client.id,
            userId,
            userName,
        };

        participants.set(client.id, participant);
        this.trackSocketMembership(client.id, slideId);

        const payloadForJoiner = this.toParticipantArray(participants);
        const participantSnapshot = this.toPublicParticipant(participant);

        client.broadcast
            .to(`slide:${slideId}`)
            .emit("userJoined", { slideId, user: participantSnapshot });

        return {
            event: "joined",
            data: {
                slideId,
                user: participantSnapshot,
                participants: payloadForJoiner,
            },
        };
    }

    @SubscribeMessage("leaveSlide")
    async handleLeaveSlide(
        @MessageBody() payload: unknown,
        @ConnectedSocket() client: Socket,
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

        const removed = this.removeParticipant(slideId, client.id);

        await client.leave(`slide:${slideId}`);

        if (removed) {
            this.server
                .to(`slide:${slideId}`)
                .emit("userLeft", { slideId, user: removed });
        }

        return {
            event: "left",
            data: removed ? { slideId, user: removed } : { slideId },
        };
    }

    handleDisconnect(client: Socket): void {
        const slideIds = this.socketSlides.get(client.id);
        if (!slideIds) {
            return;
        }

        for (const slideId of slideIds) {
            const removed = this.removeParticipant(slideId, client.id);
            if (removed) {
                this.server
                    .to(`slide:${slideId}`)
                    .emit("userLeft", { slideId, user: removed });
            }
        }

        this.socketSlides.delete(client.id);
    }

    private getOrCreateParticipants(
        slideId: string,
    ): Map<string, SlideParticipant> {
        let participants = this.slideParticipants.get(slideId);
        if (!participants) {
            participants = new Map<string, SlideParticipant>();
            this.slideParticipants.set(slideId, participants);
        }
        return participants;
    }

    private trackSocketMembership(socketId: string, slideId: string): void {
        let slides = this.socketSlides.get(socketId);
        if (!slides) {
            slides = new Set<string>();
            this.socketSlides.set(socketId, slides);
        }
        slides.add(slideId);
    }

    private removeParticipant(
        slideId: string,
        socketId: string,
    ): SlideParticipantPublic | null {
        const participants = this.slideParticipants.get(slideId);
        if (!participants) {
            return null;
        }

        const participant = participants.get(socketId);
        if (!participant) {
            return null;
        }

        participants.delete(socketId);
        if (participants.size === 0) {
            this.slideParticipants.delete(slideId);
        }

        const slides = this.socketSlides.get(socketId);
        if (slides) {
            slides.delete(slideId);
            if (slides.size === 0) {
                this.socketSlides.delete(socketId);
            }
        }

        return this.toPublicParticipant(participant);
    }

    private toParticipantArray(
        participants: Map<string, SlideParticipant>,
    ): SlideParticipantPublic[] {
        return Array.from(participants.values(), (participant) =>
            this.toPublicParticipant(participant),
        );
    }

    private toPublicParticipant(
        participant: SlideParticipant,
    ): SlideParticipantPublic {
        return {
            socketId: participant.socketId,
            userId: participant.userId,
            userName: participant.userName,
        };
    }
}

interface SlideParticipant {
    socketId: string;
    userId: string;
    userName?: string;
}

type SlideParticipantPublic = Pick<
    SlideParticipant,
    "socketId" | "userId" | "userName"
>;
