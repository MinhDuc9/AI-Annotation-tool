import { Body, Controller, Post } from "@nestjs/common";
import { AnalysisService } from "./analysis.service";

@Controller("ai")
export class AnalysisController {
    constructor(private readonly analysisService: AnalysisService) {}

    @Post("analyze")
    analyze(@Body("image_urls") imageUrls: string[]) {
        return this.analysisService.analyze(imageUrls);
    }
}
