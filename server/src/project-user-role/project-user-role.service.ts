import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { CreateProjectUserRoleDto } from "./dto/create-project-user-role.dto";
import { ProjectUserRole } from "./entities/project-user-role.entity";
import { Project } from "src/project/entities/project.entity";
import { User } from "src/user/entities/user.entity";
import { Repository } from "typeorm/repository/Repository";
import { InjectRepository } from "@nestjs/typeorm";
import { JwtPayload } from "src/jwt/jwt-payload.interface";

@Injectable({ scope: Scope.REQUEST })
export class ProjectUserRoleService {
    constructor(
        @InjectRepository(ProjectUserRole)
        private readonly projectUserRoleRepository: Repository<ProjectUserRole>,
        @InjectRepository(Project)
        private readonly projectRepository: Repository<Project>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @Inject(REQUEST)
        private readonly request: Request,
    ) {}

    async create(
        createProjectUserRoleDto: CreateProjectUserRoleDto,
    ): Promise<ProjectUserRole> {
        const { projectId, userId, role } = createProjectUserRoleDto;

        const project = await this.projectRepository.findOneOrFail({
            where: { id: projectId },
        });
        const user = await this.userRepository.findOneOrFail({
            where: { id: userId },
        });

        const projectUserRole = this.projectUserRoleRepository.create({
            project,
            user,
            role,
        });

        return this.projectUserRoleRepository.save(projectUserRole);
    }

    async findAll() {
        const userId: string = (this.request.user as JwtPayload).id;
        return await this.projectUserRoleRepository.findBy({ userId });
    }

    async findByProjectAndUser(
        projectId: string,
        userId: string,
    ): Promise<ProjectUserRole[]> {
        return this.projectUserRoleRepository.find({
            where: { projectId, userId },
        });
    }

    findOne(id: string) {
        return `This action returns a #${id} projectUserRole`;
    }
}
