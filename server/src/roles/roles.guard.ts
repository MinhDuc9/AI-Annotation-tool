import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtPayload } from "../jwt/jwt-payload.interface";
import { Request } from "express";
import { ProjectUserRoleService } from "../project-user-role/project-user-role.service";

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private projectUserRoleService: ProjectUserRoleService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredRoles = this.reflector.get<string[]>(
            "roles",
            context.getHandler(),
        );
        /*
            Active @Roles(…) on the handler → requiredRoles
            is undefined → we return true 
            and let the request through un-checked by this guard.
        */
        if (!requiredRoles) {
            return true;
        }
        const request = context.switchToHttp().getRequest<Request>();
        const user = request.user as JwtPayload;

        // Accept multiple naming conventions for the route/body param (typed safely)
        type ParamDict = Record<string, string | undefined>;
        const params: ParamDict = (request.params ?? {}) as ParamDict;

        const rawBody: unknown = request.body as unknown;
        const body: Record<string, unknown> =
            rawBody && typeof rawBody === "object"
                ? (rawBody as Record<string, unknown>)
                : {};

        const fromBody = (key: string): string | undefined => {
            const v = body[key];
            return typeof v === "string" ? v : undefined;
        };

        const projectId =
            params.project_id ??
            params.projectId ??
            params.project ??
            params.projectid ??
            fromBody("projectId") ??
            fromBody("project_id");

        if (!projectId) {
            throw new ForbiddenException(
                "Missing project id in route/body for role check",
            );
        }

        // Fetch this user's role entries for the project
        const roles = await this.projectUserRoleService.findByProjectAndUser(
            projectId,
            user.id,
        );
        // Ensure at least one matches the allowed roles
        if (!roles.some((r) => requiredRoles.includes(r.role))) {
            throw new ForbiddenException(
                `Requires one of roles: ${requiredRoles.join(", ")}`,
            );
        }

        return true;
    }
}
