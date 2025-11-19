import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsEthereumAddress,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class WalletLoginDto {
  @ApiProperty()
  @Expose({ name: 'wallet_address' })
  @Transform(({ value, obj }) => value ?? obj.wallet_address)
  @IsString()
  @IsEthereumAddress()
  walletAddress!: string;

  @ApiProperty({ description: 'Signed message from MetaMask' })
  @IsString()
  signature!: string;

  @ApiPropertyOptional({ 
    description: 'Referral code of inviter',
  })
  @IsOptional()
  @IsString()
  @Length(3, 50)
  @Transform(({ value }) => {
    if (value === 'string' || value === '') {
      return undefined;
    }
    return value;
  })
  referralCode?: string;
}

