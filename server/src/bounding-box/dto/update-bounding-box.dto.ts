import { PartialType } from '@nestjs/mapped-types';
import { CreateBoundingBoxDto } from './create-bounding-box.dto';

export class UpdateBoundingBoxDto extends PartialType(CreateBoundingBoxDto) {}
