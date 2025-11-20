import { Body, Controller, Get, Ip, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { WalletLoginDto } from './dto/wallet-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UsernameLoginDto } from './dto/username-login.dto';
import { WalletNonceQueryDto } from './dto/wallet-nonce-query.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('wallet/nonce')
  async getWalletNonce(@Query() query: WalletNonceQueryDto) {
    return this.authService.generateWalletNonce(query.walletAddress);
  }

  @Public()
  @Post('wallet/login')
  async walletLogin(@Body() dto: WalletLoginDto, @Ip() ip?: string) {
    return this.authService.walletLogin(dto, ip);
  }

  @Public()
  @Post('login')
  async usernameLogin(@Body() dto: UsernameLoginDto, @Ip() ip?: string) {
    return this.authService.usernameLogin(dto, ip);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Public()
  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto);
  }
}
