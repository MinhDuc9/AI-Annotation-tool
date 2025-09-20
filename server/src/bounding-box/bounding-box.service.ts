import { Injectable } from '@nestjs/common';
import { CreateBoundingBoxDto } from './dto/create-bounding-box.dto';
import { UpdateBoundingBoxDto } from './dto/update-bounding-box.dto';

@Injectable()
export class BoundingBoxService {
  create(createBoundingBoxDto: CreateBoundingBoxDto) {
    return 'This action adds a new boundingBox';
  }

  findAll() {
    return `This action returns all boundingBox`;
  }

  findOne(id: number) {
    return `This action returns a #${id} boundingBox`;
  }

  update(id: number, updateBoundingBoxDto: UpdateBoundingBoxDto) {
    return `This action updates a #${id} boundingBox`;
  }

  remove(id: number) {
    return `This action removes a #${id} boundingBox`;
  }
}
