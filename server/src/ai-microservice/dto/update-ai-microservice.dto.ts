import { PartialType } from "@nestjs/mapped-types";
import { CreateAiMicroserviceDto } from "./create-ai-microservice.dto";

export class UpdateAiMicroserviceDto extends PartialType(
    CreateAiMicroserviceDto,
) {}
