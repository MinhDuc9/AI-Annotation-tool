import { Body, Controller, Param, Post } from "@nestjs/common";
import { AiMicroserviceService } from "./ai-microservice.service";
import { AnalyzeSlidesDto } from "./dto/analyze-slides.dto";

@Controller("ai-microservice")
export class AiMicroserviceController {
    constructor(
        private readonly aiMicroserviceService: AiMicroserviceService,
    ) {}

    @Post("ai_auto/:project_id")
    analyzeSlides(
        @Param("project_id") projectId: string,
        @Body() body: AnalyzeSlidesDto,
    ) {
        return this.aiMicroserviceService.analyzeSlides(
            projectId,
            body.slideIds,
        );
    }
}
