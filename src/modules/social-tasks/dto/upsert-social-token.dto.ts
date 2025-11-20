import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
  Min,
  IsDateString,
} from 'class-validator';

export class UpsertSocialTokenDto {
  @ApiProperty({ description: 'OAuth access token returned by provider' })
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @ApiPropertyOptional({ description: 'Refresh token associated with access' })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional({
    description: 'Access token TTL in seconds',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expiresIn?: number;

  @ApiPropertyOptional({
    description: 'Absolute expiration timestamp provided by provider',
    type: String,
    example: '2025-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiProperty({
    description: 'Provider specific user identifier',
    example: '1234567890',
  })
  @IsString()
  @IsNotEmpty()
  externalUserId!: string;

  @ApiPropertyOptional({
    description: 'Additional metadata (scopes, username, etc)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
