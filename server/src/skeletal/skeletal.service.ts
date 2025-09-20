import { Injectable } from '@nestjs/common';
import { CreateSkeletalDto } from './dto/create-skeletal.dto';
import { UpdateSkeletalDto } from './dto/update-skeletal.dto';

@Injectable()
export class SkeletalService {
  create(createSkeletalDto: CreateSkeletalDto) {
    return 'This action adds a new skeletal';
  }

  findAll() {
    return `This action returns all skeletal`;
  }

  findOne(id: number) {
    return `This action returns a #${id} skeletal`;
  }

  update(id: number, updateSkeletalDto: UpdateSkeletalDto) {
    return `This action updates a #${id} skeletal`;
  }

  remove(id: number) {
    return `This action removes a #${id} skeletal`;
  }
}
