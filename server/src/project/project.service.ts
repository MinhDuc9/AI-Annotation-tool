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
            relations: ["adminProjects", "writeProjects"],
        });

        project.admins = [user];
        project.writeUsers = [user];

        const savedProject = await this.projectRepository.save(project);

        return savedProject;
    }

    findAll(id: string): Promise<Project[]> {
        return this.projectRepository.findBy({ id });
    }

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
