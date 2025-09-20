import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateBoundingBoxDto {
    @IsNotEmpty()
    @IsNumber()
    x_pos: number;

    @IsNotEmpty()
    @IsNumber()
    y_pos: number;

    @IsNotEmpty()
    @IsNumber()
    x_long: number;

    @IsNotEmpty()
    @IsNumber()
    y_long: number;

    @IsNotEmpty()
    @IsString()
    color: string;
}
