import { PartialType } from "@nestjs/mapped-types";
import { CreateSlideDto } from "./create-slide.dto";
import { IsOptional } from "class-validator";

export class UpdateSlideDto extends PartialType(CreateSlideDto) {
    /** Raw uploaded file (from Multer). Kept as unknown; service will narrow safely. */
    @IsOptional()
    image?: unknown;
}
