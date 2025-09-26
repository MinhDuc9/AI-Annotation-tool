import {
    BadGatewayException,
    BadRequestException,
    HttpException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Slide } from "src/slide/entities/slide.entity";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AiMicroserviceService {
    private readonly analyzeEndpoint: string;
    private readonly requestTimeoutMs: number | null;

    constructor(
        @InjectRepository(Slide)
        private readonly slideRepository: Repository<Slide>,
        configService: ConfigService,
    ) {
        this.analyzeEndpoint =
            configService.get<string>("AI_ANALYZE_ENDPOINT") ??
            "http://localhost:8000/analyze";

        const timeoutRaw = configService.get<unknown>("AI_ANALYZE_TIMEOUT_MS");
        let timeoutValue: number | null = null;
        if (typeof timeoutRaw === "number") {
            timeoutValue = timeoutRaw;
        } else if (typeof timeoutRaw === "string") {
            const parsed = Number.parseInt(timeoutRaw, 10);
            if (Number.isFinite(parsed)) {
                timeoutValue = parsed;
            }
        }

        this.requestTimeoutMs =
            timeoutValue !== null && timeoutValue > 0 ? timeoutValue : null;
    }

    async analyzeSlides(projectId: string, slideIds: string[]) {
        const normalizedIds = Array.from(
            new Set(
                slideIds
                    .map((id) => id?.trim())
                    .filter((id): id is string => Boolean(id)),
            ),
        );

        if (!normalizedIds.length) {
            throw new BadRequestException("At least one slide id is required");
        }

        const slides = await this.slideRepository.find({
            where: { id: In(normalizedIds), projectId },
            select: ["id", "projectId", "imageRoute"],
        });

        const foundIds = new Set(slides.map((slide) => slide.id));
        const missingIds = normalizedIds.filter((id) => !foundIds.has(id));

        if (missingIds.length) {
            throw new NotFoundException(
                `Slides not found for project ${projectId}: ${missingIds.join(", ")}`,
            );
        }

        const slidesWithImages = slides.filter((slide) =>
            Boolean(slide.imageRoute),
        );
        const slidesWithoutImages = slides.filter((slide) => !slide.imageRoute);

        let controller: AbortController | null = null;
        let timeout: NodeJS.Timeout | null = null;
        if (this.requestTimeoutMs !== null) {
            const localController = new AbortController();
            controller = localController;
            timeout = setTimeout(
                () => localController.abort(),
                this.requestTimeoutMs,
            );
        }

        let parsedBody: unknown = null;

        try {
            if (slidesWithImages.length) {
                const payload = {
                    slides: slidesWithImages.map((slide) => ({
                        slideId: slide.id,
                        url: slide.imageRoute,
                    })),
                };

                const response = await fetch(this.analyzeEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                    signal: controller?.signal,
                });

                const rawBody = await response.text();
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
            }
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
            if (timeout) {
                clearTimeout(timeout);
            }
        }

        const slidesById = new Map<string, Slide>(
            slidesWithImages.map<[string, Slide]>((slide) => [slide.id, slide]),
        );
        const slidesByUrl = new Map<string, string>(
            slidesWithImages
                .filter((slide) => Boolean(slide.imageRoute))
                .map<[string, string]>((slide) => [slide.imageRoute, slide.id]),
        );

        const resultsBySlideId = new Map<
            string,
            {
                analyzeResult?: unknown;
                analyzeError?: unknown;
            }
        >();

        if (parsedBody && typeof parsedBody === "object") {
            const container = parsedBody as Record<string, unknown>;
            const results = Array.isArray(container.results)
                ? container.results
                : Array.isArray(parsedBody)
                  ? (parsedBody as unknown[])
                  : [];

            for (const entry of results) {
                if (!entry || typeof entry !== "object") {
                    continue;
                }

                const record = entry as Record<string, unknown>;
                const candidateId =
                    typeof record.slideId === "string"
                        ? record.slideId
                        : typeof record.slide_id === "string"
                          ? record.slide_id
                          : undefined;
                const candidateUrl =
                    typeof record.url === "string" ? record.url : undefined;

                let resolvedId: string | undefined;
                if (candidateId && slidesById.has(candidateId)) {
                    resolvedId = candidateId;
                } else if (candidateUrl && slidesByUrl.has(candidateUrl)) {
                    resolvedId = slidesByUrl.get(candidateUrl);
                }

                if (!resolvedId) {
                    continue;
                }

                resultsBySlideId.set(resolvedId, {
                    analyzeResult:
                        record.result !== undefined ? record.result : undefined,
                    analyzeError:
                        record.error !== undefined ? record.error : undefined,
                });
            }
        }

        for (const slide of slidesWithoutImages) {
            resultsBySlideId.set(slide.id, {
                analyzeResult: null,
                analyzeError: `Slide ${slide.id} does not have an image to analyze`,
            });
        }

        const orderedSlides = normalizedIds.map(
            (id) => slides.find((slide) => slide.id === id)!,
        );

        const results = orderedSlides.map((slide) => {
            const result = resultsBySlideId.get(slide.id);

            if (!result) {
                return {
                    slideId: slide.id,
                    imageRoute: slide.imageRoute,
                    analyzeResult: null,
                    analyzeError:
                        "Analyzer did not return a result for this slide",
                };
            }

            return {
                slideId: slide.id,
                imageRoute: slide.imageRoute,
                analyzeResult:
                    result.analyzeResult !== undefined
                        ? result.analyzeResult
                        : null,
                analyzeError:
                    result.analyzeError !== undefined
                        ? result.analyzeError
                        : null,
            };
        });

        return {
            projectId,
            results,
        };
    }
}
