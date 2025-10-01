import {
    Injectable,
    NotFoundException,
    Inject,
    Scope,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Project } from "./entities/project.entity";
import { Repository } from "typeorm";
import { User } from "src/user/entities/user.entity";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { JwtPayload } from "../jwt/jwt-payload.interface";
import { ProjectUserRole } from "src/project-user-role/entities/project-user-role.entity";

@Injectable({ scope: Scope.REQUEST })
export class ProjectService {
    constructor(
        @InjectRepository(Project)
        private readonly projectRepository: Repository<Project>,

        @InjectRepository(User)
        private readonly userRepository: Repository<User>,

        @Inject(REQUEST)
        private readonly request: Request,

        @InjectRepository(ProjectUserRole)
        private readonly projectUserRoleRepository: Repository<ProjectUserRole>,
    ) {}

    async create(createProjectDto: CreateProjectDto): Promise<Project> {
        const userId = (this.request.user as JwtPayload).id;
        const user = await this.userRepository.findOneOrFail({
            where: { id: userId },
        });

        const project = new Project();
        project.projectName = createProjectDto.projectName;

        // assign initial admin role
        const adminRole = new ProjectUserRole();
        adminRole.user = user;
        adminRole.role = "admin";
        adminRole.project = project;

        project.userRoles = [adminRole];

        return await this.projectRepository.save(project);
    }

    async findAll(): Promise<
        {
            projectName: string;
            id: string;
            projectId: string;
            userId: string;
            role: "admin" | "write" | "read";
        }[]
    > {
        const userId: string = (this.request.user as JwtPayload).id;

        // load roles along with project relation
        const roles = await this.projectUserRoleRepository.find({
            where: { userId },
            relations: ["project"],
        });

        // map to include projectName
        return roles.map(({ id, projectId, userId, role, project }) => ({
            projectName: project.projectName,
            id,
            projectId,
            userId,
            role,
        }));
    }

    async ensureUserOwnsProject(projectId: string): Promise<Project> {
        const project = await this.projectRepository.findOne({
            where: { id: projectId },
            relations: ["userRoles", "userRoles.user"],
        });

        if (!project) {
            throw new NotFoundException("Project Not Found");
        }

        const currentUserId: string = (this.request.user as JwtPayload).id;
        const isMember: boolean = project.userRoles.some(
            (ur) => ur.userId == currentUserId,
        );

        if (!isMember) {
            throw new ForbiddenException(
                "You are not a member of this project",
            );
        }

        return project;
    }

    async addWriteUser(projectId: string, userEmail: string): Promise<Project> {
        const project = await this.ensureUserOwnsProject(projectId);

        const user = await this.userRepository.findOneOrFail({
            where: { email: userEmail },
        });

        // Check for existing role
        const existingRole = project.userRoles.find(
            (ur) => ur.userId === user.id,
        );
        if (existingRole) {
            if (existingRole.role === "write") {
                return project;
            }
            // Upgrade role
            existingRole.role = "write";
        } else {
            const writeRole = new ProjectUserRole();
            writeRole.user = user;
            writeRole.role = "write";
            writeRole.project = project;
            project.userRoles.push(writeRole);
        }

        return await this.projectRepository.save(project);
    }

    async addReadUser(projectId: string, userEmail: string): Promise<Project> {
        const project = await this.ensureUserOwnsProject(projectId);

        // look up the user
        const user = await this.userRepository.findOneOrFail({
            where: { email: userEmail },
        });

        // if they already have any role (admin/write/read), do nothing
        const existing = project.userRoles.find((ur) => ur.userId === user.id);
        if (existing) {
            throw new ConflictException(
                `User ${userEmail} already has a role on this project`,
            );
        }

        // otherwise, give them a read role
        const readRole = new ProjectUserRole();
        readRole.project = project;
        readRole.user = user;
        readRole.role = "read";
        project.userRoles.push(readRole);

        return this.projectRepository.save(project);
    }

    async getAllUserProject(projectId: string): Promise<
        {
            userId: string;
            userName: string;
            email: string;
            role: "admin" | "write" | "read";
        }[]
    > {
        // Ensure the requesting user belongs to the project before listing members
        await this.ensureUserOwnsProject(projectId);

        const projectRoles = await this.projectUserRoleRepository.find({
            where: { projectId },
            relations: ["user"],
        });

        return projectRoles.map(({ role, user }) => ({
            role,
            userId: user.id,
            userName: user.userName,
            email: user.email,
        }));
    }

    async update(
        projectId: string,
        updateProjectDto: UpdateProjectDto,
    ): Promise<Project> {
        const project = await this.ensureUserOwnsProject(projectId);

        if (updateProjectDto.projectName !== undefined) {
            project.projectName = updateProjectDto.projectName;
        }

        // Update user roles if provided
        if (updateProjectDto.userRoles) {
            // Build desired user-role map
            const desiredMap = new Map<
                string,
                { user: User; role: "admin" | "write" | "read" }
            >();
            for (const urDto of updateProjectDto.userRoles) {
                const user = await this.userRepository.findOneOrFail({
                    where: { email: urDto.userEmail },
                });
                desiredMap.set(user.id, { user, role: urDto.role });
            }

            // Remove roles not in desired list
            const existingRoles = project.userRoles;
            const rolesToRemove = existingRoles.filter(
                (er) => !desiredMap.has(er.userId),
            );
            if (rolesToRemove.length > 0) {
                await this.projectUserRoleRepository.remove(rolesToRemove);
            }

            // Update existing roles and remove them from the desired map
            for (const er of existingRoles) {
                const desired = desiredMap.get(er.userId);
                if (desired) {
                    if (er.role !== desired.role) {
                        er.role = desired.role;
                        await this.projectUserRoleRepository.save(er);
                    }
                    desiredMap.delete(er.userId);
                }
            }

            // Add new roles for remaining entries in desiredMap
            const rolesToAdd: ProjectUserRole[] = [];
            for (const { user, role } of desiredMap.values()) {
                const pr = new ProjectUserRole();
                pr.project = project;
                pr.user = user;
                pr.role = role;
                rolesToAdd.push(pr);
            }
            if (rolesToAdd.length > 0) {
                await this.projectUserRoleRepository.save(rolesToAdd);
            }
        }

        // Persist project changes (name and cascaded roles)
        return this.projectRepository.save(project);
    }

    async remove(projectId: string): Promise<void> {
        const project = await this.projectRepository.findOne({
            where: { id: projectId },
            relations: ["userRoles"],
        });

        if (!project) {
            throw new NotFoundException(`Project ${projectId} not found`);
        }

        // Remove all related roles first to satisfy FK constraints
        if (project.userRoles?.length) {
            await this.projectUserRoleRepository.remove(project.userRoles);
        }

        await this.projectRepository.remove(project);
    }
}
