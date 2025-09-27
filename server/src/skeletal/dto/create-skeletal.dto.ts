import {
    IsArray,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
} from "class-validator";

export class CreateSkeletalDto {
    @IsNotEmpty()
    @IsNumber()
    x_pos: number;

    @IsNotEmpty()
    @IsNumber()
    y_pos: number;

    @IsOptional()
    @IsArray()
    @IsUUID("4", { each: true })
    key_points?: string[] | null;

    @IsNotEmpty()
    @IsString()
    color: string;

    @IsNotEmpty()
    @IsString()
    category: string;
}
