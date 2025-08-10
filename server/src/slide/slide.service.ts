import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
    Scope,
} from "@nestjs/common";
import * as path from "path";
import { promises as fs } from "fs";
import { REQUEST } from "@nestjs/core";
import { UpdateSlideDto } from "./dto/update-slide.dto";
import { Slide } from "./entities/slide.entity";
import { ProjectService } from "src/project/project.service";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Project } from "src/project/entities/project.entity";
import { Request } from "express";

// Minimal shape we require from an uploaded file
interface UploadedImageLike {
    buffer: Buffer;
    originalname: string;
}

function isUploadedImage(f: unknown): f is UploadedImageLike {
    if (typeof f !== "object" || f === null) return false;
    const rec = f as Record<string, unknown>;
    const nameOk = typeof rec["originalname"] === "string";
    const buf = rec["buffer"];
    const bufOk = typeof buf !== "undefined" && buf instanceof Buffer;
    return nameOk && bufOk;
}

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

    async update(
        slideId: string,
        _updateSlideDto: UpdateSlideDto,
        file?: unknown,
    ) {
        // Find slide
        const slide = await this.slideRepository.findOneBy({ id: slideId });
        if (!slide) {
            throw new NotFoundException(`Slide with id ${slideId} not found`);
        }

        // Enforce project ownership/visibility (defensive)
        await this.projectService.ensureUserOwnsProject(slide.projectId);

        // Validate uploaded image from PATCH
        if (!isUploadedImage(file)) {
            throw new BadRequestException(
                "No image uploaded or invalid file payload. Expecting field 'image'.",
            );
        }

        // Derive a deterministic filename based on slide id, keep original extension if present
        const originalExt = path.extname(file.originalname || "") || ".bin";
        const safeExt = originalExt.toLowerCase();
        const filename = `${slide.id}${safeExt}`;

        // Build destination path: /uploads/projects/{projectId}/slides/{filename}
        const webRoute = `/uploads/projects/${slide.projectId}/slides/${filename}`;
        const diskDir = path.join(
            process.cwd(),
            "uploads",
            "projects",
            slide.projectId,
            "slides",
        );
        const diskPath = path.join(diskDir, filename);

        // Ensure directory exists then write file
        await fs.mkdir(diskDir, { recursive: true });
        await fs.writeFile(diskPath, file.buffer);

        // Persist route onto entity (column: imageRoute)
        slide.imageRoute = webRoute;

        // Save and return updated slide
        return await this.slideRepository.save(slide);
    }

    remove(id: number) {
        return `This action removes a #${id} slide`;
    }
}
