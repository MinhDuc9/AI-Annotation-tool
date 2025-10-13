import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "./jwt.service";
import { Request } from "express";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../auth/public.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly reflector: Reflector,
    ) {}

    canActivate(ctx: ExecutionContext): boolean {
        // 1. check for @Public()
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [ctx.getHandler(), ctx.getClass()],
        );
        if (isPublic) return true;

        // 2. otherwise do normal JWT check
        const req = ctx.switchToHttp().getRequest<Request>();
        const authHeader = req.headers.authorization;
        if (typeof authHeader !== "string") {
            throw new UnauthorizedException(
                "Missing or invalid Authorization header",
            );
        }
        const [scheme, token] = authHeader.split(" ");

        if (scheme !== "Bearer" || !token)
            throw new UnauthorizedException("Bad header");

        try {
            req.user = this.jwtService.validateJWT(token);
            return true;
        } catch {
            throw new UnauthorizedException("Invalid or expired token");
        }
    }
}
