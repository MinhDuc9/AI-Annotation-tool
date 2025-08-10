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

// Minimal shape we need from a Multer file to avoid ambient type dependency
interface MulterLikeFile {
    originalname: string;
    buffer: Buffer;
}

// Runtime type guard to safely narrow unknown/any to MulterLikeFile
function isMulterFile(file: unknown): file is MulterLikeFile {
    if (typeof file !== "object" || file === null) return false;
    // Use `in` checks to avoid unsafe member access
    if (!("originalname" in file) || !("buffer" in file)) return false;
    const orig = (file as { originalname: unknown }).originalname;
    const buf = (file as { buffer: unknown }).buffer;
    return typeof orig === "string" && buf instanceof Buffer;
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

        // If no file provided, keep existing imageRoute untouched
        if (file !== undefined) {
            // Validate uploaded image from PATCH using a strict runtime guard
            if (!isMulterFile(file)) {
                throw new BadRequestException(
                    "No image uploaded or invalid file payload. Expecting field 'image'.",
                );
            }

            // From here, `file` matches the Multer-like shape we need
            const mf: MulterLikeFile = file;

            // Derive a deterministic filename based on slide id, keep original extension if present
            const originalExt: string =
                path.extname(mf.originalname || "") || ".bin";
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
            await fs.writeFile(diskPath, mf.buffer);

            // Persist route onto entity (column: imageRoute)
            slide.imageRoute = webRoute;
        }

        // Save and return updated slide
        return await this.slideRepository.save(slide);
    }

    remove(id: number) {
        return `This action removes a #${id} slide`;
    }
}
