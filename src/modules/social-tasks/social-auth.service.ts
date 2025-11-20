import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSocialAccount } from './entities/user-social-account.entity';
import { SocialProvider } from '../../common/enums/social-provider.enum';
import { UpsertSocialTokenDto } from './dto/upsert-social-token.dto';
import { BusinessException } from '../../common/exceptions/business.exception';

@Injectable()
export class SocialAuthService {
  constructor(
    @InjectRepository(UserSocialAccount)
    private readonly socialAccountRepository: Repository<UserSocialAccount>,
  ) {}

  async upsertAccount(userId: string, provider: SocialProvider, dto: UpsertSocialTokenDto) {
    let account = await this.socialAccountRepository.findOne({
      where: { userId, provider },
    });
    if (!account) {
      account = this.socialAccountRepository.create({
        userId,
        provider,
      });
    }
    account.externalUserId = dto.externalUserId;
    account.accessToken = dto.accessToken;
    account.refreshToken = dto.refreshToken ?? null;
    account.expiresAt = this.resolveExpiry(dto);
    account.metadata = dto.metadata ?? account.metadata ?? null;
    return this.socialAccountRepository.save(account);
  }

  async getAccountOrThrow(userId: string, provider: SocialProvider) {
    const account = await this.socialAccountRepository.findOne({
      where: { userId, provider },
    });
    if (!account) {
      throw new BusinessException({
        code: 'SOCIAL_ACCOUNT_NOT_LINKED',
        message: `User has not linked ${provider} account`,
        status: 400,
      });
    }
    return account;
  }

  private resolveExpiry(dto: UpsertSocialTokenDto) {
    if (dto.expiresAt) {
      return new Date(dto.expiresAt);
    }
    if (dto.expiresIn) {
      return new Date(Date.now() + dto.expiresIn * 1000);
    }
    return null;
  }
}
