import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Skeletal } from "./entities/skeletal.entity";
import { Slide } from "src/slide/entities/slide.entity";
import { CreateSkeletalDto } from "./dto/create-skeletal.dto";
import { UpdateSkeletalDto } from "./dto/update-skeletal.dto";

@Injectable()
export class SkeletalService {
    constructor(
        @InjectRepository(Skeletal)
        private readonly skeletalRepository: Repository<Skeletal>,
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
        skeletalId: string,
        slideId: string,
    ): Promise<Skeletal> {
        await this.ensureSlide(slideId);

        const skeletal = await this.skeletalRepository.findOne({
            where: { id: skeletalId, slideId },
        });
        if (!skeletal) {
            throw new NotFoundException(
                `Skeletal with id ${skeletalId} not found for slide ${slideId}`,
            );
        }
        return skeletal;
    }

    async create(
        slideId: string,
        createSkeletalDto: CreateSkeletalDto,
    ): Promise<Skeletal> {
        const slide = await this.ensureSlide(slideId);

        const skeletal = this.skeletalRepository.create({
            slideId: slide.id,
            slide,
            x_pos: createSkeletalDto.x_pos,
            y_pos: createSkeletalDto.y_pos,
            key_points:
                createSkeletalDto.key_points &&
                createSkeletalDto.key_points.length > 0
                    ? createSkeletalDto.key_points
                    : null,
            color: createSkeletalDto.color,
            category: createSkeletalDto.category,
        });

        return await this.skeletalRepository.save(skeletal);
    }

    async findAll(slideId: string): Promise<Skeletal[]> {
        await this.ensureSlide(slideId);
        return this.skeletalRepository.find({ where: { slideId } });
    }

    async findOne(skeletalId: string, slideId: string): Promise<Skeletal> {
        return this.findEntityOrFail(skeletalId, slideId);
    }

    async update(
        skeletalId: string,
        slideId: string,
        updateSkeletalDto: UpdateSkeletalDto,
    ): Promise<Skeletal> {
        const skeletal = await this.findEntityOrFail(skeletalId, slideId);

        if (updateSkeletalDto.x_pos !== undefined) {
            skeletal.x_pos = updateSkeletalDto.x_pos;
        }
        if (updateSkeletalDto.y_pos !== undefined) {
            skeletal.y_pos = updateSkeletalDto.y_pos;
        }
        if (updateSkeletalDto.key_points !== undefined) {
            skeletal.key_points =
                updateSkeletalDto.key_points &&
                updateSkeletalDto.key_points.length > 0
                    ? updateSkeletalDto.key_points
                    : null;
        }
        if (updateSkeletalDto.color !== undefined) {
            skeletal.color = updateSkeletalDto.color;
        }
        if (updateSkeletalDto.category !== undefined) {
            skeletal.category = updateSkeletalDto.category;
        }

        return await this.skeletalRepository.save(skeletal);
    }

    async remove(skeletalId: string, slideId: string): Promise<void> {
        const skeletal = await this.findEntityOrFail(skeletalId, slideId);
        await this.skeletalRepository.remove(skeletal);
    }
}
