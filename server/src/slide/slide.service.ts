import {
    BadRequestException,
    Injectable,
    NotFoundException,
    StreamableFile,
} from "@nestjs/common";
import * as path from "path";
import { createReadStream, promises as fs } from "fs";
import { UpdateSlideDto } from "./dto/update-slide.dto";
import { Slide } from "./entities/slide.entity";
import { ProjectService } from "src/project/project.service";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CommentService } from "src/comment/comment.service";
import { Comment } from "src/comment/entities/comment.entity";

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

@Injectable()
export class SlideService {
    constructor(
        @InjectRepository(Slide)
        private readonly slideRepository: Repository<Slide>,
        private readonly projectService: ProjectService,
        private readonly commentService: CommentService,
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

    async findAll(projectId: string): Promise<Slide[]> {
        await this.projectService.ensureUserOwnsProject(projectId);
        return this.slideRepository.find({
            where: { projectId },
            select: ["id", "projectId"],
        });
    }

    async findOne(slideId: string): Promise<StreamableFile | null> {
        // Find slide
        const slide = await this.slideRepository.findOneBy({ id: slideId });
        if (!slide) {
            throw new NotFoundException(`Slide with id ${slideId} not found`);
        }

        // Enforce project ownership/visibility (defensive)
        await this.projectService.ensureUserOwnsProject(slide.projectId);

        // If no image route stored, return nothing as requested
        if (!slide.imageRoute) {
            return null;
        }

        // Build absolute disk path from stored web route, e.g. "/uploads/..."
        const relPath = slide.imageRoute.replace(/^\/+/, "");
        const diskPath = path.join(process.cwd(), relPath);

        // Ensure the file exists
        try {
            await fs.access(diskPath);
        } catch {
            throw new NotFoundException(
                `Image file not found for slide ${slideId}`,
            );
        }

        // Minimal content-type mapping by extension
        const ext = path.extname(diskPath).toLowerCase();
        const mimeMap: Record<string, string> = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
        };
        const contentType = mimeMap[ext] || "application/octet-stream";

        const fileStream = createReadStream(diskPath);

        return new StreamableFile(fileStream, {
            type: contentType,
            disposition: `inline; filename="${path.basename(diskPath)}"`,
        });
    }
    async findOneWithComments(slideId: string): Promise<{
        slideId: string;
        projectId: string;
        comments: Comment[];
    }> {
        // Find slide
        const slide = await this.slideRepository.findOneBy({ id: slideId });
        if (!slide) {
            throw new NotFoundException(`Slide with id ${slideId} not found`);
        }

        // Enforce project ownership/visibility (defensive)
        await this.projectService.ensureUserOwnsProject(slide.projectId);

        // Fetch all comments for this slide (new)
        const comments = await this.commentService.findAll(slide.id);

        return {
            slideId: slide.id,
            projectId: slide.projectId,
            comments,
        };
    }

    async update(
        slideId: string,
        _updateSlideDto: UpdateSlideDto,
        file?: unknown,
    ): Promise<Slide> {
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

    async remove(slideId: string) {
        const slide = await this.slideRepository.findOneBy({ id: slideId });
        if (!slide) {
            throw new NotFoundException(`Slide with id ${slideId} not found`);
        }

        // Best-effort removal of the image from the filesystem
        if (slide.imageRoute) {
            const relPath = slide.imageRoute.replace(/^\/+/, "");
            const diskPath = path.join(process.cwd(), relPath);
            try {
                await fs.unlink(diskPath);
            } catch (err: unknown) {
                // Ignore if the file doesn't exist; rethrow other errors
                const code =
                    typeof err === "object" && err && "code" in err
                        ? (err as { code?: string }).code
                        : undefined;
                if (code !== "ENOENT") {
                    throw err;
                }
            }
        }

        // Delete the slide record
        await this.slideRepository.delete({ id: slideId });

        return `Removed slide ${slideId}`;
    }
}
