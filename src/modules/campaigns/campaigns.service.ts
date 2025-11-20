import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { DataSource, Repository } from 'typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignParticipation } from './entities/campaign-participation.entity';
import { Task } from '../social-tasks/entities/task.entity';
import { CampaignQueryDto } from './dto/campaign-query.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ClaimsService } from '../claims/claims.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CampaignClaim } from '../claims/entities/campaign-claim.entity';
import { UserTask } from '../user-tasks/entities/user-task.entity';
import { UserTaskStatus } from '../../common/enums/user-task-status.enum';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignParticipation)
    private readonly participationRepository: Repository<CampaignParticipation>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(UserTask)
    private readonly userTaskRepository: Repository<UserTask>,
    @InjectRepository(CampaignClaim)
    private readonly campaignClaimRepository: Repository<CampaignClaim>,
    private readonly claimsService: ClaimsService,
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async findAll(query: CampaignQueryDto) {
    const cacheKey = `campaigns:${JSON.stringify(query)}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }
    const qb = this.campaignRepository.createQueryBuilder('campaign');
    if (query.category) {
      qb.andWhere('campaign.category = :category', {
        category: query.category,
      });
    }
    if (query.active !== undefined) {
      if (query.active) {
        qb.andWhere(
          '(campaign.startAt IS NULL OR campaign.startAt <= now()) AND (campaign.endAt IS NULL OR campaign.endAt >= now())',
        );
      } else {
        qb.andWhere(
          '(campaign.endAt IS NOT NULL AND campaign.endAt < now()) OR (campaign.startAt IS NOT NULL AND campaign.startAt > now())',
        );
      }
    }
    if (query.search) {
      qb.andWhere('(campaign.title ILIKE :search OR campaign.description ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    qb.skip((page - 1) * limit)
      .take(limit)
      .orderBy('campaign.createdAt', 'DESC');
    const [items, total] = await qb.getManyAndCount();
    const response = {
      items,
      meta: {
        total,
        page,
        limit,
      },
    };
    await this.cacheManager.set(cacheKey, response, 60);
    return response;
  }

  async findOne(id: string, userId?: string | null) {
    const cacheKey = userId ? null : `campaign:${id}`;
    if (!userId && cacheKey) {
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) return cached;
    }
    const campaign = await this.campaignRepository.findOne({
      where: { id },
      relations: ['tasks'],
    });
    if (!campaign) {
      throw new BusinessException({
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign not found',
        status: 404,
      });
    }
    if (campaign.tasks) {
      campaign.tasks = campaign.tasks.sort((a, b) => a.taskOrder - b.taskOrder);
    }
    const data: any = { campaign };
    if (userId) {
      const participation = await this.participationRepository.findOne({
        where: { userId, campaignId: id },
      });
      const userTasks = await this.userTaskRepository.find({
        where: { userId, campaignId: id },
      });
      data.participation = participation;
      data.userTasks = userTasks;
    } else if (cacheKey) {
      await this.cacheManager.set(cacheKey, data, 60);
    }
    return data;
  }

  async joinCampaign(campaignId: string, userId: string) {
    await this.dataSource.transaction(async (manager) => {
      const campaign = await manager.getRepository(Campaign).findOne({
        where: { id: campaignId },
        lock: { mode: 'pessimistic_write' as const },
      });
      if (!campaign) {
        throw new BusinessException({
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found',
          status: 404,
        });
      }
      this.ensureActive(campaign);
      const participationRepo = manager.getRepository(CampaignParticipation);
      const existing = await participationRepo.findOne({
        where: { userId, campaignId },
      });
      if (existing) {
        throw new BusinessException({
          code: 'ALREADY_JOINED',
          message: 'Already joined',
          status: 409,
        });
      }
      await participationRepo.save(participationRepo.create({ userId, campaignId }));
      campaign.questersCount += 1;
      await manager.getRepository(Campaign).save(campaign);
    });
    await this.invalidateCache();
    return { message: 'Joined campaign' };
  }

  async getTasks(campaignId: string, userId?: string | null) {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
      relations: ['tasks'],
    });
    if (!campaign) {
      throw new BusinessException({
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign not found',
        status: 404,
      });
    }
    const tasks = (campaign.tasks ?? []).sort((a, b) => a.taskOrder - b.taskOrder);
    if (!userId) {
      return tasks;
    }
    const userTasks = await this.userTaskRepository.find({
      where: { userId, campaignId },
    });
    const statusMap = new Map(userTasks.map((ut) => [ut.taskId, ut]));
    return tasks.map((task) => ({
      ...task,
      userStatus: this.mapUserTaskStatus(statusMap.get(task.id)),
      completedAt: statusMap.get(task.id)?.completedAt ?? null,
    }));
  }

  async claimCampaign(userId: string, campaignId: string) {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw new BusinessException({
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign not found',
        status: 404,
      });
    }
    this.ensureActive(campaign);
    return this.claimsService.claimCampaign(userId, campaignId);
  }

  async getClaims(campaignId: string) {
    return this.campaignClaimRepository.find({
      where: { campaignId },
    });
  }

  async createCampaign(dto: CreateCampaignDto) {
    const campaign = this.campaignRepository.create({
      ...dto,
      category: dto.category ?? null,
      startAt: dto.startAt ? new Date(dto.startAt) : null,
      endAt: dto.endAt ? new Date(dto.endAt) : null,
    });
    const saved = await this.campaignRepository.save(campaign);
    await this.invalidateCache();
    return saved;
  }

  async updateCampaign(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.campaignRepository.findOne({ where: { id } });
    if (!campaign) {
      throw new BusinessException({
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign not found',
        status: 404,
      });
    }
    Object.assign(campaign, {
      ...dto,
      category: dto.category !== undefined ? dto.category : campaign.category,
      startAt: dto.startAt ? new Date(dto.startAt) : campaign.startAt,
      endAt: dto.endAt ? new Date(dto.endAt) : campaign.endAt,
    });
    const saved = await this.campaignRepository.save(campaign);
    await this.invalidateCache();
    return saved;
  }

  async deleteCampaign(id: string) {
    await this.campaignRepository.delete(id);
    await this.invalidateCache();
    return { deleted: true };
  }

  async addTask(campaignId: string, dto: CreateTaskDto) {
    const task = this.taskRepository.create({
      ...dto,
      config: dto.config ?? {},
      campaignId,
    });
    const saved = await this.taskRepository.save(task);
    await this.invalidateCache();
    return saved;
  }

  async updateTask(taskId: string, dto: UpdateTaskDto) {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new BusinessException({
        code: 'TASK_NOT_FOUND',
        message: 'Task not found',
        status: 404,
      });
    }
    Object.assign(task, {
      ...dto,
      config: dto.config !== undefined ? dto.config : task.config,
    });
    const saved = await this.taskRepository.save(task);
    await this.invalidateCache();
    return saved;
  }

  async removeTask(taskId: string) {
    await this.taskRepository.delete(taskId);
    await this.invalidateCache();
    return { deleted: true };
  }

  async invalidateCache() {
    await this.cacheManager.reset();
  }

  private ensureActive(campaign: Campaign) {
    const now = new Date();
    if ((campaign.startAt && campaign.startAt > now) || (campaign.endAt && campaign.endAt < now)) {
      throw new BusinessException({
        code: 'CAMPAIGN_NOT_ACTIVE',
        message: 'Campaign is not active',
        status: 400,
      });
    }
  }

  private mapUserTaskStatus(userTask?: UserTask | null) {
    if (!userTask) {
      return UserTaskStatus.Pending;
    }
    if (
      userTask.status === UserTaskStatus.Approved ||
      userTask.status === UserTaskStatus.Completed
    ) {
      return 'completed';
    }
    if (userTask.status === UserTaskStatus.Rejected) {
      return 'rejected';
    }
    return userTask.status;
  }
}
