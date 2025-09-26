import { Controller, Get, Param } from "@nestjs/common";
import { AiMicroserviceService } from "./ai-microservice.service";

@Controller("ai-microservice")
export class AiMicroserviceController {
    constructor(
        private readonly aiMicroserviceService: AiMicroserviceService,
    ) {}

    @Get("ai_auto/:project_id/:slide_id")
    analyzeSlide(
        @Param("project_id") projectId: string,
        @Param("slide_id") slideId: string,
    ) {
        return this.aiMicroserviceService.analyzeSlide(projectId, slideId);
    }
}
