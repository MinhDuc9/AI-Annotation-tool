import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtPayload } from "src/jwt/jwt-payload.interface";
import { Request } from "express";
import { ProjectUserRoleService } from "src/project-user-role/project-user-role.service";

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
        const projectId: string = request.params.projectId;

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
