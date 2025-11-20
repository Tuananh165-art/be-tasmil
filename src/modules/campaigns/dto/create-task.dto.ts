import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  IsObject,
  MaxLength,
  Min,
} from 'class-validator';
import { TaskType } from '../../../common/enums/task-type.enum';

export class CreateTaskDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  urlAction?: string;

  @ApiProperty({ enum: TaskType })
  @IsEnum(TaskType)
  type!: TaskType;

  @ApiProperty({
    description: 'Reward points granted when completing the task',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  rewardPointTask!: number;

  @ApiPropertyOptional({
    description: 'Provider specific configuration (groupId, username, tweetId, etc)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  config?: Record<string, any>;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  taskOrder?: number;
}
