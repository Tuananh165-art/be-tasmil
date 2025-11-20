import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsEthereumAddress, IsString } from 'class-validator';

export class UsernameLoginDto {
  @ApiProperty()
  @IsString()
  username!: string;

  @ApiProperty({ name: 'wallet_address' })
  @Expose({ name: 'wallet_address' })
  @Transform(({ value, obj }) => value ?? obj.wallet_address)
  @IsEthereumAddress()
  walletAddress!: string;

  @ApiProperty({ description: 'Signed nonce message' })
  @IsString()
  signature!: string;
}
