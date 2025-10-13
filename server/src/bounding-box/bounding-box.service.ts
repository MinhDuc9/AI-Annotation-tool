import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateBoundingBoxDto } from "./dto/create-bounding-box.dto";
import { UpdateBoundingBoxDto } from "./dto/update-bounding-box.dto";
import { BoundingBox } from "./entities/bounding-box.entity";
import { Slide } from "../slide/entities/slide.entity";

@Injectable()
export class BoundingBoxService {
    constructor(
        @InjectRepository(BoundingBox)
        private readonly boundingBoxRepository: Repository<BoundingBox>,
        @InjectRepository(Slide)
        private readonly slideRepository: Repository<Slide>,
    ) {}

    private async ensureSlide(slideId: string): Promise<Slide> {
        const slide = await this.slideRepository.findOne({
            where: { id: slideId },
        });
        if (!slide) {
            throw new NotFoundException(`Slide with id ${slideId} not found`);
        }
        return slide;
    }

    private async findEntityOrFail(
        boundingBoxId: string,
        slideId: string,
    ): Promise<BoundingBox> {
        await this.ensureSlide(slideId);

        const boundingBox = await this.boundingBoxRepository.findOne({
            where: { id: boundingBoxId, slideId },
        });
        if (!boundingBox) {
            throw new NotFoundException(
                `Bounding box with id ${boundingBoxId} not found for slide ${slideId}`,
            );
        }
        return boundingBox;
    }

    async create(
        slideId: string,
        createBoundingBoxDto: CreateBoundingBoxDto,
    ): Promise<BoundingBox> {
        const slide = await this.ensureSlide(slideId);

        const boundingBox = this.boundingBoxRepository.create({
            slideId: slide.id,
            slide,
            x_pos: createBoundingBoxDto.x_pos,
            y_pos: createBoundingBoxDto.y_pos,
            x_long: createBoundingBoxDto.x_long,
            y_long: createBoundingBoxDto.y_long,
            color: createBoundingBoxDto.color,
            category: createBoundingBoxDto.category,
        });

        return this.boundingBoxRepository.save(boundingBox);
    }

    async findAll(slideId: string): Promise<BoundingBox[]> {
        await this.ensureSlide(slideId);
        return this.boundingBoxRepository.find({ where: { slideId } });
    }

    async findOne(
        boundingBoxId: string,
        slideId: string,
    ): Promise<BoundingBox> {
        return this.findEntityOrFail(boundingBoxId, slideId);
    }

    async update(
        boundingBoxId: string,
        slideId: string,
        updateBoundingBoxDto: UpdateBoundingBoxDto,
    ): Promise<BoundingBox> {
        const boundingBox = await this.findEntityOrFail(boundingBoxId, slideId);

        if (updateBoundingBoxDto.x_pos !== undefined) {
            boundingBox.x_pos = updateBoundingBoxDto.x_pos;
        }
        if (updateBoundingBoxDto.y_pos !== undefined) {
            boundingBox.y_pos = updateBoundingBoxDto.y_pos;
        }
        if (updateBoundingBoxDto.x_long !== undefined) {
            boundingBox.x_long = updateBoundingBoxDto.x_long;
        }
        if (updateBoundingBoxDto.y_long !== undefined) {
            boundingBox.y_long = updateBoundingBoxDto.y_long;
        }
        if (updateBoundingBoxDto.color !== undefined) {
            boundingBox.color = updateBoundingBoxDto.color;
        }
        if (updateBoundingBoxDto.category !== undefined) {
            boundingBox.category = updateBoundingBoxDto.category;
        }

        return this.boundingBoxRepository.save(boundingBox);
    }

    async remove(boundingBoxId: string, slideId: string): Promise<void> {
        const boundingBox = await this.findEntityOrFail(boundingBoxId, slideId);
        await this.boundingBoxRepository.remove(boundingBox);
    }
}
