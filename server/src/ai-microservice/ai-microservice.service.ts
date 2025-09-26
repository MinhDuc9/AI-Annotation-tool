import {
    BadGatewayException,
    BadRequestException,
    HttpException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Slide } from "src/slide/entities/slide.entity";

const ANALYZE_ENDPOINT = "http://localhost:8000/analyze";
const DEFAULT_TIMEOUT_MS = 100_000;

@Injectable()
export class AiMicroserviceService {
    constructor(
        @InjectRepository(Slide)
        private readonly slideRepository: Repository<Slide>,
    ) {}

    async analyzeSlide(projectId: string, slideId: string) {
        const slide = await this.slideRepository.findOne({
            where: { id: slideId, projectId },
            select: ["id", "projectId", "imageRoute"],
        });

        if (!slide) {
            throw new NotFoundException(
                `Slide ${slideId} not found for project ${projectId}`,
            );
        }

        if (!slide.imageRoute) {
            throw new BadRequestException(
                `Slide ${slideId} does not have an image to analyze`,
            );
        }

        const payload = { urls: slide.imageRoute };
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            DEFAULT_TIMEOUT_MS,
        );

        try {
            const response = await fetch(ANALYZE_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            const rawBody = await response.text();
            let parsedBody: unknown = null;
            if (rawBody) {
                try {
                    parsedBody = JSON.parse(rawBody);
                } catch {
                    parsedBody = rawBody;
                }
            }

            if (!response.ok) {
                throw new BadGatewayException({
                    message: `Analyze service responded with status ${response.status}`,
                    status: response.status,
                    details: parsedBody,
                });
            }

            return {
                projectId,
                slideId,
                imageRoute: slide.imageRoute,
                analyzeResult: parsedBody,
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            if ((error as Error).name === "AbortError") {
                throw new BadGatewayException(
                    "Analyze service request timed out",
                );
            }

            throw new BadGatewayException(
                `Failed to reach analyze service: ${(error as Error).message || "unknown error"}`,
            );
        } finally {
            clearTimeout(timeout);
        }
    }
}
