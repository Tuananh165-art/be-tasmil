import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsEthereumAddress } from 'class-validator';

export class WalletNonceQueryDto {
  @ApiProperty()
  @Expose({ name: 'wallet_address' })
  @Transform(({ value, obj }) => value ?? obj.wallet_address ?? obj.walletAddress)
  @IsEthereumAddress()
  walletAddress!: string;
}


