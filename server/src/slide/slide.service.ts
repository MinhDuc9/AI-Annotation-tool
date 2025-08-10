import { Inject, Injectable, NotFoundException, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { UpdateSlideDto } from "./dto/update-slide.dto";
import { Slide } from "./entities/slide.entity";
import { ProjectService } from "src/project/project.service";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Project } from "src/project/entities/project.entity";
import { Request } from "express";

@Injectable({ scope: Scope.REQUEST })
export class SlideService {
    constructor(
        @Inject(REQUEST)
        private readonly request: Request,

        @InjectRepository(Slide)
        private readonly slideRepository: Repository<Slide>,

        @InjectRepository(Project)
        private readonly projectRepository: Repository<Project>,

        private readonly projectService: ProjectService,
    ) {}

    async create(projectId: string): Promise<Slide> {
        const project =
            await this.projectService.ensureUserOwnsProject(projectId);

        if (!project) {
            throw new NotFoundException(
                `No project found with id ${projectId}`,
            );
        }

        // Create a new slide and attach to the project
        const slide = new Slide();
        slide.project = project;
        slide.projectId = project.id; // explicit FK value
        slide.imageRoute = ""; // placeholder; to be updated later

        // Persist directly through the Slide repository to avoid side-effects
        const created = await this.slideRepository.save(slide);
        return created;
    }

    findAll() {
        return `This action returns all slide`;
    }

    findOne(id: number) {
        return `This action returns a #${id} slide`;
    }

    update(id: number, updateSlideDto: UpdateSlideDto) {
        return `This action updates a #${id} slide`;
    }

    remove(id: number) {
        return `This action removes a #${id} slide`;
    }
}
