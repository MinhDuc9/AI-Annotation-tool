import { PartialType } from '@nestjs/mapped-types';
import { CreateSkeletalDto } from './create-skeletal.dto';

export class UpdateSkeletalDto extends PartialType(CreateSkeletalDto) {}
