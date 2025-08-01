import { Injectable } from "@nestjs/common";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Project } from "./entities/project.entity";
import { Repository } from "typeorm";
import { User } from "src/user/entities/user.entity";

@Injectable()
export class ProjectService {
    constructor(
        @InjectRepository(Project)
        private readonly projectRepository: Repository<Project>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    async create(
        createProjectDto: CreateProjectDto,
        user_id: string,
    ): Promise<Project> {
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

    async findAll(user_id: string): Promise<
        {
            project_id: string;
            project_name: string;
            role: "admin" | "writer" | "read";
        }[]
    > {
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

    // TODO: addUser, removeUser, updateRole ...
    // addUser(project_id: string, user_id: string) {}

    findOne(id: number) {
        return `This action returns a #${id} project`;
    }

    update(id: number, updateProjectDto: UpdateProjectDto) {
        return `This action updates a #${id} project`;
    }

    remove(id: number) {
        return `This action removes a #${id} project`;
    }
}
