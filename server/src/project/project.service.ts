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

@Injectable({ scope: Scope.REQUEST })
export class ProjectService {
    constructor(
        @InjectRepository(Project)
        private readonly projectRepository: Repository<Project>,

        @InjectRepository(User)
        private readonly userRepository: Repository<User>,

        @Inject(REQUEST)
        private readonly request: Request,
    ) {}

    async create(createProjectDto: CreateProjectDto): Promise<Project> {
        const user_id: string = (this.request.user as JwtPayload).id;
        const project = new Project();
        project.project_name = createProjectDto.project_name;

        const user = await this.userRepository.findOneOrFail({
            where: { id: user_id },
            relations: ["adminProjects"],
        });

        project.admins = [user];

        const savedProject = await this.projectRepository.save(project);

        return savedProject;
    }

    async findAll(): Promise<
        {
            project_id: string;
            project_name: string;
            role: "admin" | "writer" | "read";
        }[]
    > {
        const user_id: string = (this.request.user as JwtPayload).id;
        const projects = await this.projectRepository
            .createQueryBuilder("project")
            .leftJoinAndSelect("project.admins", "admin")
            .leftJoinAndSelect("project.readUsers", "readUser")
            .leftJoinAndSelect("project.writeUsers", "writeUser")
            .where("admin.id = :user_id", { user_id })
            .orWhere("readUser.id = :user_id", { user_id })
            .orWhere("writeUser.id = :user_id", { user_id })
            .getMany();

        return projects.map((project) => {
            let role: "admin" | "writer" | "read";
            if (project.admins.some((u) => u.id === user_id)) {
                role = "admin";
            } else if (project.writeUsers.some((u) => u.id === user_id)) {
                role = "writer";
            } else {
                role = "read";
            }
            return {
                project_id: project.id,
                project_name: project.project_name,
                role,
            };
        });
    }

    async addWriteUser(
        project_id: string,
        user_email: string,
    ): Promise<Project> {
        const project = await this.projectRepository.findOne({
            where: { id: project_id },
            relations: ["admins", "writeUsers"],
        });

        const user = await this.userRepository.findOneOrFail({
            where: { email: user_email },
        });

        if (!project) {
            throw new NotFoundException(`${project_id} not found`);
        }

        if (!user) {
            throw new NotFoundException(`${user_email} email not found`);
        }

        if (!project.writeUsers.some((u) => u.id === user.id)) {
            project.writeUsers.push(user);
        }

        const saved = await this.projectRepository.save(project);

        return saved;
    }

    async findOneWithAdmins(project_id: string): Promise<Project> {
        const project = await this.projectRepository.findOne({
            where: { id: project_id },
            relations: ["admins"],
        });

        if (!project) {
            throw new NotFoundException(`Project ${project_id} not found`);
        }

        return project;
    }

    update(id: number, updateProjectDto: UpdateProjectDto) {
        return `This action updates a #${id} project`;
    }

    remove(id: number) {
        return `This action removes a #${id} project`;
    }
}
