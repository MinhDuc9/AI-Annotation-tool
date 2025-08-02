import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ProjectService } from "../project/project.service";
import { JwtPayload } from "src/jwt/jwt-payload.interface";
import { Request } from "express";

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private projectService: ProjectService,
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

        const request = context
            .switchToHttp()
            .getRequest<Request & { user: JwtPayload }>();
        const user = request.user as JwtPayload;
        const projectId = request.params.project_id;

        if (requiredRoles.includes("admin")) {
            const project =
                await this.projectService.findOneWithAdmins(projectId);
            if (!project.admins.some((u) => u.id === user.id)) {
                throw new ForbiddenException(
                    "Only project admins can perform this",
                );
            }
            return true;
        }

        return false;
    }
}
