import { ArrayNotEmpty, IsArray, IsString } from "class-validator";

export class AnalyzeSlidesDto {
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    slideIds!: string[];
}
