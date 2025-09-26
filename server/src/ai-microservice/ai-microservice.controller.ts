import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
} from "@nestjs/common";
import { AiMicroserviceService } from "./ai-microservice.service";
import { CreateAiMicroserviceDto } from "./dto/create-ai-microservice.dto";
import { UpdateAiMicroserviceDto } from "./dto/update-ai-microservice.dto";

@Controller("ai-microservice")
export class AiMicroserviceController {
    constructor(
        private readonly aiMicroserviceService: AiMicroserviceService,
    ) {}

    @Post()
    create(@Body() createAiMicroserviceDto: CreateAiMicroserviceDto) {
        return this.aiMicroserviceService.create(createAiMicroserviceDto);
    }

    @Get()
    findAll() {
        return this.aiMicroserviceService.findAll();
    }

    @Get(":id")
    findOne(@Param("id") id: string) {
        return this.aiMicroserviceService.findOne(+id);
    }

    @Patch(":id")
    update(
        @Param("id") id: string,
        @Body() updateAiMicroserviceDto: UpdateAiMicroserviceDto,
    ) {
        return this.aiMicroserviceService.update(+id, updateAiMicroserviceDto);
    }

    @Delete(":id")
    remove(@Param("id") id: string) {
        return this.aiMicroserviceService.remove(+id);
    }
}
