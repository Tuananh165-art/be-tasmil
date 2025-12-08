import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { verifyMessage, isAddress } from 'ethers';
import { randomBytes, randomUUID } from 'crypto';
import { Response, Request } from 'express';
import { WalletLoginDto } from './dto/wallet-login.dto';
import { UsersService } from '../users/users.service';
import { WalletNonceQueryDto } from './dto/wallet-nonce-query.dto';
import { RedisService } from '../../infra/redis/redis.service';
import { RateLimiterService } from '../../shared/services/rate-limiter.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UsernameLoginDto } from './dto/username-login.dto';
import { UserRole } from '../../common/enums/user-role.enum';

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  accessToken: string;
  user: any;
}

@Injectable()
export class AuthService {
  private readonly nonceTtl = 300;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly rateLimiterService: RateLimiterService,
  ) {}

  async generateWalletNonce(walletAddress: string) {
    const normalized = this.normalizeWalletAddress(walletAddress);
    await this.rateLimiterService.consume(`nonce:${normalized}`, 1);

    const nonce = randomBytes(16).toString('hex');
    await this.redisService.setValue(
      this.getNonceKey(normalized),
      nonce,
      this.nonceTtl,
    );

    const result: any = {
      walletAddress: normalized,
      nonce,
      expiresIn: this.nonceTtl,
    };

    return result;
  }

  private isDevelopmentMode(): boolean {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    return nodeEnv !== 'production';
  }

  async walletLogin(dto: WalletLoginDto, res: Response, ip?: string): Promise<LoginResponse> {
    try {
      await this.rateLimiterService.consume(`wallet-login:${ip ?? 'unknown'}`, 2);
      const normalizedWallet = this.normalizeWalletAddress(dto.walletAddress);
      const nonce = await this.redisService.getValue(
        this.getNonceKey(normalizedWallet),
      );
      if (!nonce) {
        throw new BusinessException({
          code: 'NONCE_EXPIRED',
          message: 'Nonce expired or not found',
          status: 400,
        });
      }
      this.verifySignature(normalizedWallet, dto.signature, nonce);
      await this.redisService.delete(this.getNonceKey(normalizedWallet));

      const user = await this.usersService.ensureWalletUser(
        normalizedWallet,
        dto.referralCode,
      );
      await this.usersService.handleLoginSuccess(user.id);
      const tokens = await this.issueTokens(user);
      
      this.setRefreshTokenCookie(res, tokens.refreshToken);
      
      return {
        accessToken: tokens.accessToken,
        user: await this.usersService.getMe(user.id),
      };

    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }

      console.error('Error in walletLogin:', error);
      throw new BusinessException({
        code: 'LOGIN_FAILED',
        message: error instanceof Error ? error.message : 'Login failed',
        status: 500,
      });
    }
  }

  async usernameLogin(dto: UsernameLoginDto, res: Response, ip?: string): Promise<LoginResponse> {
    await this.rateLimiterService.consume(`username-login:${ip ?? 'unknown'}`);
    const normalizedWallet = this.normalizeWalletAddress(dto.walletAddress);
    const nonce = await this.redisService.getValue(
      this.getNonceKey(normalizedWallet),
    );
    if (!nonce) {
      throw new BusinessException({
        code: 'NONCE_EXPIRED',
        message: 'Nonce expired or not found',
        status: 400,
      });
    }
    this.verifySignature(normalizedWallet, dto.signature, nonce);
    await this.redisService.delete(this.getNonceKey(normalizedWallet));

    const user = await this.usersService.getByUsername(dto.username);
    if (!user || user.walletAddress.toLowerCase() !== normalizedWallet) {
      throw new BusinessException({
        code: 'INVALID_LOGIN',
        message: 'Username or wallet mismatch',
        status: 401,
      });
    }
    await this.usersService.handleLoginSuccess(user.id);
    const tokens = await this.issueTokens(user);
    
    this.setRefreshTokenCookie(res, tokens.refreshToken);
    
    return {
      accessToken: tokens.accessToken,
      user: await this.usersService.getMe(user.id),
    };
  }

  async refreshTokens(req: Request, res: Response): Promise<LoginResponse> {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        throw new Error('Refresh token not found');
      }
      
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: this.configService.get<string>('auth.jwtRefreshSecret'),
        },
      );
      if (!payload.tokenId) {
        throw new Error('Missing token id');
      }
      const stored = await this.redisService.getValue(
        this.getRefreshKey(payload.tokenId),
      );
      if (!stored) {
        throw new Error('Refresh token revoked');
      }
      await this.redisService.delete(this.getRefreshKey(payload.tokenId));
      const user = await this.usersService.getById(payload.sub);
      if (!user) {
        throw new Error('User not found');
      }
      const tokens = await this.issueTokens(user);
      
      this.setRefreshTokenCookie(res, tokens.refreshToken);
      
      return {
        accessToken: tokens.accessToken,
        user: await this.usersService.getMe(user.id),
      };
    } catch (error) {
      throw new BusinessException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
        status: 401,
      });
    }
  }

  async logout(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (refreshToken) {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(
          refreshToken,
          {
            secret: this.configService.get<string>('auth.jwtRefreshSecret'),
          },
        );
        if (payload.tokenId) {
          await this.redisService.delete(this.getRefreshKey(payload.tokenId));
        }
      }
    } catch {

    }
    
    this.clearRefreshTokenCookie(res);
    
    return { message: 'Logged out' };
  }

  private verifySignature(
    walletAddress: string,
    signature: string,
    nonce: string,
  ) {
    try {
      const message = `Tasmil Login Nonce: ${nonce}`;
      const recovered = verifyMessage(message, signature).toLowerCase();
      if (recovered !== walletAddress.toLowerCase()) {
        throw new BusinessException({
          code: 'INVALID_SIGNATURE',
          message: 'Signature does not match wallet address',
          status: 401,
        });
      }
    } catch (error) {

      if (error instanceof BusinessException) {
        throw error;
      }

      throw new BusinessException({
        code: 'INVALID_SIGNATURE',
        message: 'Invalid signature format or verification failed',
        status: 401,
      });
    }
  }

  private async issueTokens(user: {
    id: string;
    walletAddress: string;
    role: UserRole;
    username: string;
  }): Promise<TokenResponse> {
    const accessPayload: JwtPayload = {
      sub: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
      username: user.username,
    };
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      expiresIn: this.configService.get<number>('auth.jwtAccessTtl', 900),
    });

    const tokenId = randomUUID();
    const refreshPayload: JwtPayload = {
      ...accessPayload,
      tokenId,
    };
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.get<string>('auth.jwtRefreshSecret'),
      expiresIn: this.configService.get<number>('auth.jwtRefreshTtl', 604800),
    });
    await this.redisService.setValue(
      this.getRefreshKey(tokenId),
      user.id,
      this.configService.get<number>('auth.jwtRefreshTtl', 604800),
    );

    return { accessToken, refreshToken };
  }

  private getNonceKey(walletAddress: string) {
    return `wallet_nonce:${walletAddress.toLowerCase()}`;
  }

  private getRefreshKey(tokenId: string) {
    return `refresh_token:${tokenId}`;
  }

  private normalizeWalletAddress(address?: string) {
    if (!address || !isAddress(address)) {
      throw new BusinessException({
        code: 'INVALID_WALLET_ADDRESS',
        message: 'Wallet address is invalid',
        status: 400,
      });
    }
    return address.toLowerCase();
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string) {
    const refreshTtl = this.configService.get<number>('auth.jwtRefreshTtl', 604800);
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge: refreshTtl * 1000,
    });
  }

  private clearRefreshTokenCookie(res: Response) {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
    });
  }
}

