import { Injectable, NotFoundException, Inject, Scope } from "@nestjs/common";
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
        project.projectName = createProjectDto.project_name;

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

    async addWriteUser(projectId: string, userEmail: string): Promise<Project> {
        const project = await this.projectRepository.findOne({
            where: { id: projectId },
            relations: ["userRoles"],
        });

        if (!project) {
            throw new NotFoundException(`Project ${projectId} not found`);
        }

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
        // load current roles (with their user) for this project
        const project = await this.projectRepository.findOne({
            where: { id: projectId },
            relations: ["userRoles"],
        });
        if (!project) {
            throw new NotFoundException(`Project ${projectId} not found`);
        }

        // look up the user
        const user = await this.userRepository.findOneOrFail({
            where: { email: userEmail },
        });

        // if they already have any role (admin/write/read), do nothing
        const existing = project.userRoles.find((ur) => ur.userId === user.id);
        if (existing) {
            return project;
        }

        // otherwise, give them a read role
        const readRole = new ProjectUserRole();
        readRole.project = project;
        readRole.user = user;
        readRole.role = "read";
        project.userRoles.push(readRole);

        return this.projectRepository.save(project);
    }

    async update(projectId: string, updateProjectDto: UpdateProjectDto) {
        const project = await this.projectRepository.findOneBy({
            id: projectId,
        });

        if (!project) {
            throw new NotFoundException("Project not found");
        }

        if (updateProjectDto.project_name !== undefined) {
            project.projectName = updateProjectDto.project_name;
        }

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
