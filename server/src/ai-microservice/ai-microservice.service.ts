import {
    BadGatewayException,
    BadRequestException,
    HttpException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Slide } from "../slide/entities/slide.entity";
import { BoundingBox } from "../bounding-box/entities/bounding-box.entity";
import { Skeletal } from "../skeletal/entities/skeletal.entity";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AiMicroserviceService {
    private readonly analyzeEndpoint: string;
    private readonly requestTimeoutMs: number | null;

    constructor(
        @InjectRepository(Slide)
        private readonly slideRepository: Repository<Slide>,
        @InjectRepository(BoundingBox)
        private readonly boundingBoxRepository: Repository<BoundingBox>,
        @InjectRepository(Skeletal)
        private readonly skeletalRepository: Repository<Skeletal>,
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
        const slidesWithImagesSet = new Set(
            slidesWithImages.map((slide) => slide.id),
        );

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

        const persistenceQueue: Array<{
            slideId: string;
            analyzeResult: unknown;
        }> = [];

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

            const analyzeResultValue =
                result.analyzeResult !== undefined
                    ? result.analyzeResult
                    : null;

            if (slidesWithImagesSet.has(slide.id)) {
                persistenceQueue.push({
                    slideId: slide.id,
                    analyzeResult: analyzeResultValue,
                });
            }

            return {
                slideId: slide.id,
                imageRoute: slide.imageRoute,
                analyzeResult: analyzeResultValue,
                analyzeError:
                    result.analyzeError !== undefined
                        ? result.analyzeError
                        : null,
            };
        });

        if (persistenceQueue.length) {
            await this.persistAnalyzerOutputs(persistenceQueue);
        }

        return {
            projectId,
            results,
        };
    }

    private toFiniteNumber(value: unknown): number | null {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === "string") {
            const parsed = Number.parseFloat(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return null;
    }

    private toNormalizedString(value: unknown): string | null {
        if (typeof value === "string") {
            const trimmed = value.trim();
            return trimmed ? trimmed : null;
        }
        return null;
    }

    private extractBoundingBoxes(
        slideId: string,
        analyzeResult: unknown,
    ): Partial<BoundingBox>[] {
        if (!analyzeResult || typeof analyzeResult !== "object") {
            return [];
        }

        const container = analyzeResult as Record<string, unknown>;
        const rawBoxes = Array.isArray(container.bbox)
            ? container.bbox
            : Array.isArray(container.bounding_boxes)
              ? container.bounding_boxes
              : [];

        const boundingBoxes: Partial<BoundingBox>[] = [];

        for (const rawBox of rawBoxes) {
            if (!rawBox || typeof rawBox !== "object") {
                continue;
            }

            const box = rawBox as Record<string, unknown>;

            const idValue = this.toNormalizedString(box.bb_id || box.id);
            const xPos = this.toFiniteNumber(box.x_pos ?? box.x);
            const yPos = this.toFiniteNumber(box.y_pos ?? box.y);
            const xLong = this.toFiniteNumber(box.x_long ?? box.width);
            const yLong = this.toFiniteNumber(box.y_long ?? box.height);

            if (
                xPos === null ||
                yPos === null ||
                xLong === null ||
                yLong === null
            ) {
                continue;
            }

            const color =
                this.toNormalizedString(box.color ?? box.colour) ?? "#000000";
            const category =
                this.toNormalizedString(box.category ?? box.species_name) ??
                "unknown";

            const entry: Partial<BoundingBox> = {
                slideId,
                x_pos: xPos,
                y_pos: yPos,
                x_long: xLong,
                y_long: yLong,
                color,
                category,
            };

            if (idValue) {
                entry.id = idValue;
            }

            boundingBoxes.push(entry);
        }

        return boundingBoxes;
    }

    private extractSkeletals(
        slideId: string,
        analyzeResult: unknown,
    ): Partial<Skeletal>[] {
        if (!analyzeResult || typeof analyzeResult !== "object") {
            return [];
        }

        const container = analyzeResult as Record<string, unknown>;
        const rawSkeletal = Array.isArray(container.skeletal)
            ? container.skeletal
            : [];

        const skeletalEntities: Partial<Skeletal>[] = [];

        for (const skeletalEntry of rawSkeletal) {
            if (!skeletalEntry || typeof skeletalEntry !== "object") {
                continue;
            }

            const entryRecord = skeletalEntry as Record<string, unknown>;
            const keypointsRaw = Array.isArray(entryRecord.keypoints)
                ? entryRecord.keypoints
                : [];

            const prepared: Array<{
                id: string;
                x: number;
                y: number;
                color: string;
                category: string;
                connections: string[];
            }> = [];

            for (const kp of keypointsRaw) {
                if (!kp || typeof kp !== "object") {
                    continue;
                }
                const kpRecord = kp as Record<string, unknown>;

                const idValue = this.toNormalizedString(
                    kpRecord.key_id ?? kpRecord.id,
                );
                const x = this.toFiniteNumber(kpRecord.x_pos ?? kpRecord.x);
                const y = this.toFiniteNumber(kpRecord.y_pos ?? kpRecord.y);

                if (!idValue || x === null || y === null) {
                    continue;
                }

                const color =
                    this.toNormalizedString(
                        kpRecord.color ?? kpRecord.colour,
                    ) ?? "#000000";
                const category =
                    this.toNormalizedString(
                        kpRecord.category ?? kpRecord.name,
                    ) ?? "unknown";

                const connections = Array.isArray(kpRecord.key_points)
                    ? kpRecord.key_points.filter(
                          (value): value is string =>
                              typeof value === "string" &&
                              value.trim().length > 0,
                      )
                    : [];

                prepared.push({
                    id: idValue,
                    x,
                    y,
                    color,
                    category,
                    connections,
                });
            }

            const validIds = new Set(prepared.map((item) => item.id));

            for (const item of prepared) {
                const filteredConnections = item.connections.filter((conn) =>
                    validIds.has(conn),
                );

                skeletalEntities.push({
                    id: item.id,
                    slideId,
                    x_pos: item.x,
                    y_pos: item.y,
                    key_points:
                        filteredConnections.length > 0
                            ? filteredConnections
                            : null,
                    color: item.color,
                    category: item.category,
                });
            }
        }

        return skeletalEntities;
    }

    private async persistAnalyzerOutputs(
        entries: Array<{ slideId: string; analyzeResult: unknown }>,
    ): Promise<void> {
        for (const { slideId, analyzeResult } of entries) {
            const boundingBoxes = this.extractBoundingBoxes(
                slideId,
                analyzeResult,
            );
            const skeletals = this.extractSkeletals(slideId, analyzeResult);

            await this.boundingBoxRepository.manager.transaction(
                async (manager) => {
                    const bboxRepo = manager.getRepository(BoundingBox);
                    const skeletalRepo = manager.getRepository(Skeletal);

                    await skeletalRepo.delete({ slideId });
                    await bboxRepo.delete({ slideId });

                    if (boundingBoxes.length) {
                        await bboxRepo.save(
                            boundingBoxes.map((box) => bboxRepo.create(box)),
                        );
                    }

                    if (skeletals.length) {
                        await skeletalRepo.save(
                            skeletals.map((skel) => skeletalRepo.create(skel)),
                        );
                    }
                },
            );
        }
    }
}
