import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
} from "@nestjs/common";
import { BoundingBoxService } from "./bounding-box.service";
import { CreateBoundingBoxDto } from "./dto/create-bounding-box.dto";
import { UpdateBoundingBoxDto } from "./dto/update-bounding-box.dto";

@Controller("bounding-box")
export class BoundingBoxController {
    constructor(private readonly boundingBoxService: BoundingBoxService) {}

    @Post()
    create(@Body() createBoundingBoxDto: CreateBoundingBoxDto) {
        return this.boundingBoxService.create(createBoundingBoxDto);
    }

    @Get()
    findAll() {
        return this.boundingBoxService.findAll();
    }

    @Get(":id")
    findOne(@Param("id") id: string) {
        return this.boundingBoxService.findOne(+id);
    }

    @Patch(":id")
    update(
        @Param("id") id: string,
        @Body() updateBoundingBoxDto: UpdateBoundingBoxDto,
    ) {
        return this.boundingBoxService.update(+id, updateBoundingBoxDto);
    }

    @Delete(":id")
    remove(@Param("id") id: string) {
        return this.boundingBoxService.remove(+id);
    }
}
