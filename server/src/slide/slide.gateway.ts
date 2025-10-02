import {
    ConnectedSocket,
    MessageBody,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    WsResponse,
} from "@nestjs/websockets";
import { ContextIdFactory, ModuleRef } from "@nestjs/core";
import { InjectRepository } from "@nestjs/typeorm";
import type { Request } from "express";
import type { Server, Socket } from "socket.io";
import { Repository } from "typeorm";
import { parseWsPayload, pickString } from "../common/ws.utils";
import { ProjectService } from "../project/project.service";
import { Slide } from "./entities/slide.entity";

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

    constructor(
        @InjectRepository(Slide)
        private readonly slideRepository: Repository<Slide>,
        private readonly moduleRef: ModuleRef,
    ) {}

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

        const slide = await this.slideRepository.findOne({
            where: { id: slideId },
        });

        if (!slide) {
            return {
                event: "error",
                data: { message: "Slide not found" },
            };
        }

        let userName: string;
        try {
            userName = await this.resolveMemberName(slide.projectId, userId);
        } catch (error) {
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : "User is not a member of this project";
            return {
                event: "error",
                data: { message },
            };
        }

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
            .emit("joined", { slideId, user: participantSnapshot });

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

        this.emitUserLeft(slideId, removed, client);

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
            this.emitUserLeft(slideId, removed);
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

    private async resolveMemberName(
        projectId: string,
        userId: string,
    ): Promise<string> {
        const contextId = ContextIdFactory.create();
        // Forge a request scope carrying the candidate user id so we can reuse
        // ensureUserOwnsProject for membership validation without exposing userId to clients.
        const fakeRequest = { user: { id: userId } } as unknown as Request;
        this.moduleRef.registerRequestByContextId(fakeRequest, contextId);

        const projectService = await this.moduleRef.resolve(
            ProjectService,
            contextId,
            { strict: false },
        );

        const project = await projectService.ensureUserOwnsProject(projectId);
        const membership = project.userRoles.find(
            (role) => role.userId === userId,
        );

        if (!membership || !membership.user) {
            throw new Error("User is not a member of this project");
        }

        return membership.user.userName ?? "";
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
            userName: participant.userName,
        };
    }

    private emitUserLeft(
        slideId: string,
        participant: SlideParticipantPublic | null,
        origin?: Socket,
    ): void {
        if (!participant) {
            return;
        }

        const room = `slide:${slideId}`;
        if (origin) {
            origin.broadcast
                .to(room)
                .emit("left", { slideId, user: participant });
            return;
        }

        this.server.to(room).emit("left", { slideId, user: participant });
    }
}

interface SlideParticipant {
    socketId: string;
    userId: string;
    userName: string;
}

type SlideParticipantPublic = Pick<SlideParticipant, "socketId" | "userName">;
