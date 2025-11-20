import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { User } from './entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ReferralEvent } from '../claims/entities/referral-event.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { resolveTierByPoints } from '../../common/utils/tier.util';
import { RedisService } from '../../infra/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { isYesterdayUTC } from '../../common/utils/date.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(ReferralEvent)
    private readonly referralEventRepository: Repository<ReferralEvent>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async ensureWalletUser(walletAddress: string, referralCode?: string) {
    const wallet = walletAddress.toLowerCase();
    let user = await this.usersRepository.findOne({
      where: { walletAddress: wallet },
    });
    if (user) {
      return user;
    }
    const username = await this.generateUsername(wallet);

    let referredById: string | undefined;
    if (referralCode) {
      const refUser = await this.usersRepository.findOne({
        where: { referralCode },
      });
      if (refUser) {
        referredById = refUser.id;
      }
    }

    user = this.usersRepository.create({
      walletAddress: wallet,
      username,
      referralCode: await this.generateReferralCode(),
      referredById,
    });
    return this.usersRepository.save(user);
  }

  async handleLoginSuccess(userId: string) {
    await this.usersRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const user = await repo.findOne({ where: { id: userId } });
      if (!user) {
        return;
      }
      const now = new Date();
      if (isYesterdayUTC(user.lastLoginAt ?? null)) {
        user.loginStreak += 1;
      } else {
        user.loginStreak = 1;
      }
      user.lastLoginAt = now;
      await repo.save(user);
    });
  }

  async getMe(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new BusinessException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
        status: 404,
      });
    }
    return user;
  }

  async getByUsername(username: string) {
    return this.usersRepository.findOne({ where: { username } });
  }

  async getById(id: string) {
    return this.usersRepository.findOne({ where: { id } });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.getMe(userId);
    if (dto.username && dto.username !== user.username) {
      const existing = await this.usersRepository.findOne({
        where: { username: dto.username },
      });
      if (existing) {
        throw new BusinessException({
          code: 'USERNAME_TAKEN',
          message: 'Username already taken',
          status: 409,
        });
      }
      user.username = dto.username;
    }
    if (dto.avatarUrl) {
      user.avatarUrl = dto.avatarUrl;
    }
    if (dto.email !== undefined && dto.email !== user.email) {
      const normalizedEmail = dto.email ? dto.email.trim().toLowerCase() : null;
      if (normalizedEmail) {
        const existingEmail = await this.usersRepository.findOne({
          where: { email: normalizedEmail },
        });
        if (existingEmail && existingEmail.id !== user.id) {
          throw new BusinessException({
            code: 'EMAIL_TAKEN',
            message: 'Email already in use',
            status: 409,
          });
        }
      }
      user.email = normalizedEmail;
    }
    return this.usersRepository.save(user);
  }

  async getPublicProfile(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new BusinessException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
        status: 404,
      });
    }
    const { email: _email, ...publicUser } = user;
    return publicUser;
  }

  async getPointsHistory(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const totalResult = await this.usersRepository.query(
      `
      SELECT COUNT(*) FROM (
        SELECT id FROM task_claims WHERE user_id = $1
        UNION ALL
        SELECT id FROM campaign_claims WHERE user_id = $1
        UNION ALL
        SELECT id FROM referral_events WHERE user_id = $1
      ) q
    `,
      [userId],
    );
    const total = parseInt(totalResult[0].count, 10);
    const rows = await this.usersRepository.query(
      `
      SELECT id, points_earned as points, 'task' as type, claimed_at as occurred_at, task_id, campaign_id
        FROM task_claims WHERE user_id = $1
      UNION ALL
      SELECT id, points_earned as points, 'campaign' as type, claimed_at as occurred_at, NULL as task_id, campaign_id
        FROM campaign_claims WHERE user_id = $1
      UNION ALL
      SELECT id, points_awarded as points, 'referral' as type, created_at as occurred_at, NULL as task_id, NULL as campaign_id
        FROM referral_events WHERE user_id = $1
      ORDER BY occurred_at DESC
      LIMIT $2 OFFSET $3
    `,
      [userId, limit, offset],
    );
    return { items: rows, total };
  }

  async getReferrals(userId: string) {
    const referrals = await this.usersRepository.find({
      where: { referredById: userId },
    });
    const earnings = await this.referralEventRepository
      .createQueryBuilder('event')
      .select('event.referredUserId', 'referredUserId')
      .addSelect('SUM(event.pointsAwarded)', 'points')
      .where('event.userId = :userId', { userId })
      .groupBy('event.referredUserId')
      .getRawMany();
    const earningsMap = new Map<string, number>(
      earnings.map((row) => [row.referreduserid ?? row.referredUserId, Number(row.points)]),
    );
    return referrals.map((ref) => ({
      id: ref.id,
      username: ref.username,
      totalPoints: ref.totalPoints,
      tier: ref.tier,
      earnedPoints: earningsMap.get(ref.id) ?? 0,
    }));
  }

  async dailyLoginReward(userId: string) {
    const cacheKey = `daily_login:${userId}`;
    const existing = await this.redisService.getValue(cacheKey);
    if (existing) {
      return { message: 'Already claimed today' };
    }
    const reward = 10;
    await this.applyPointChange(userId, reward);
    await this.redisService.setValue(cacheKey, '1', 24 * 60 * 60);
    return { pointsAwarded: reward };
  }

  async applyPointChange(userId: string, delta: number, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(User) : this.usersRepository;
    await repo.increment({ id: userId }, 'totalPoints', delta);
    await this.syncTier(userId, manager);
  }

  async syncTier(userId: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(User) : this.usersRepository;
    const user = await repo.findOne({ where: { id: userId } });
    if (!user) {
      return;
    }
    const tier = resolveTierByPoints(user.totalPoints);
    if (tier !== user.tier) {
      user.tier = tier;
      await repo.save(user);
    }
  }

  async handleReferralReward(referredUserId: string, userTaskId?: string) {
    const user = await this.usersRepository.findOne({
      where: { id: referredUserId },
    });
    if (!user?.referredById) {
      return;
    }
    const existing = await this.referralEventRepository.findOne({
      where: { referredUserId },
    });
    if (existing) {
      return;
    }
    const points = this.configService.get<number>('auth.referralRewardPoints', 100);
    await this.dataSource.transaction(async (manager) => {
      const eventRepo = manager.getRepository(ReferralEvent);
      const hasEvent = await eventRepo.findOne({
        where: { referredUserId },
      });
      if (hasEvent) return;
      await this.applyPointChange(user.referredById!, points, manager);
      await eventRepo.save(
        eventRepo.create({
          userId: user.referredById,
          referredUserId,
          pointsAwarded: points,
          userTaskId,
        }),
      );
    });
  }

  private async generateUsername(walletAddress: string) {
    const base = `user_${walletAddress.slice(-6)}`;
    let candidate = base;
    let exists = await this.usersRepository.findOne({
      where: { username: candidate },
    });
    let attempt = 0;
    while (exists) {
      attempt += 1;
      candidate = `${base}_${attempt}`;
      exists = await this.usersRepository.findOne({
        where: { username: candidate },
      });
    }
    return candidate;
  }

  private async generateReferralCode() {
    let code = uuid().split('-')[0];
    while (await this.usersRepository.exist({ where: { referralCode: code } })) {
      code = uuid().split('-')[0];
    }
    return code;
  }
}
