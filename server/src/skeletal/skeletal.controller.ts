import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SkeletalService } from './skeletal.service';
import { CreateSkeletalDto } from './dto/create-skeletal.dto';
import { UpdateSkeletalDto } from './dto/update-skeletal.dto';

@Controller('skeletal')
export class SkeletalController {
  constructor(private readonly skeletalService: SkeletalService) {}

  @Post()
  create(@Body() createSkeletalDto: CreateSkeletalDto) {
    return this.skeletalService.create(createSkeletalDto);
  }

  @Get()
  findAll() {
    return this.skeletalService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.skeletalService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSkeletalDto: UpdateSkeletalDto) {
    return this.skeletalService.update(+id, updateSkeletalDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.skeletalService.remove(+id);
  }
}
