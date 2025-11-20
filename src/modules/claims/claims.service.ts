import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, QueryFailedError, EntityManager, In } from 'typeorm';
import { TaskClaim } from './entities/task-claim.entity';
import { CampaignClaim } from './entities/campaign-claim.entity';
import { UserTask } from '../user-tasks/entities/user-task.entity';
import { Task } from '../social-tasks/entities/task.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { UserTaskStatus } from '../../common/enums/user-task-status.enum';
import { UsersService } from '../users/users.service';

@Injectable()
export class ClaimsService {
  constructor(
    @InjectRepository(TaskClaim)
    private readonly taskClaimRepository: Repository<TaskClaim>,
    @InjectRepository(CampaignClaim)
    private readonly campaignClaimRepository: Repository<CampaignClaim>,
    @InjectRepository(UserTask)
    private readonly userTaskRepository: Repository<UserTask>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async claimTask(userId: string, taskId: string) {
    return this.dataSource.transaction(async (manager) => {
      const userTask = await manager.getRepository(UserTask).findOne({
        where: { userId, taskId },
        lock: { mode: 'pessimistic_write' as const },
        relations: ['task'],
      });
      if (!userTask || !this.isTaskCompleted(userTask.status)) {
        throw new BusinessException({
          code: 'TASK_NOT_APPROVED',
          message: 'Task not approved',
          status: 400,
        });
      }
      const task =
        userTask.task ??
        (await manager.getRepository(Task).findOne({
          where: { id: taskId },
        }));
      if (!task) {
        throw new BusinessException({
          code: 'TASK_NOT_FOUND',
          message: 'Task not found',
          status: 404,
        });
      }
      const points = userTask.pointsEarned || task.rewardPointTask;
      const claimRepo = manager.getRepository(TaskClaim);
      const claim = claimRepo.create({
        userId,
        campaignId: userTask.campaignId,
        taskId,
        pointsEarned: points,
      });
      try {
        await claimRepo.save(claim);
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw new BusinessException({
            code: 'ALREADY_CLAIMED',
            message: 'Task already claimed',
            status: 409,
          });
        }
        throw error;
      }
      if (!userTask.pointsEarned) {
        userTask.pointsEarned = points;
        await manager.getRepository(UserTask).save(userTask);
      }
      await this.usersService.applyPointChange(userId, points, manager);
      return claim;
    });
  }

  async claimCampaign(userId: string, campaignId: string) {
    return this.dataSource.transaction(async (manager) => {
      const campaign = await manager.getRepository(Campaign).findOne({
        where: { id: campaignId },
      });
      if (!campaign) {
        throw new BusinessException({
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found',
          status: 404,
        });
      }
      const tasks = await manager.getRepository(Task).find({
        where: { campaignId },
      });
      if (tasks.length === 0) {
        throw new BusinessException({
          code: 'CAMPAIGN_HAS_NO_TASKS',
          message: 'Campaign has no tasks to verify',
          status: 400,
        });
      }
      const completedTasks = await manager.getRepository(UserTask).find({
        where: {
          userId,
          campaignId,
          status: In([UserTaskStatus.Approved, UserTaskStatus.Completed]),
        },
      });
      const completedMap = new Map(completedTasks.map((ut) => [ut.taskId, ut]));
      const incomplete = tasks.find((task) => !completedMap.has(task.id));
      if (incomplete) {
        throw new BusinessException({
          code: 'CAMPAIGN_TASKS_INCOMPLETE',
          message: 'Complete all tasks before claiming campaign reward',
          status: 400,
        });
      }
      const claimRepo = manager.getRepository(CampaignClaim);
      const existingClaim = await claimRepo.findOne({
        where: { userId, campaignId },
      });
      if (existingClaim) {
        throw new BusinessException({
          code: 'ALREADY_CLAIMED',
          message: 'Campaign already claimed',
          status: 400,
        });
      }
      const taskRewardTotal = tasks.reduce((sum, task) => {
        const userTask = completedMap.get(task.id);
        const reward = userTask?.pointsEarned ?? task.rewardPointTask ?? 0;
        return sum + reward;
      }, 0);
      const campaignReward = campaign.rewardPointCampaign;
      const totalReward = campaignReward + taskRewardTotal;
      const claim = claimRepo.create({
        userId,
        campaignId,
        pointsEarned: totalReward,
      });
      try {
        await claimRepo.save(claim);
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw new BusinessException({
            code: 'ALREADY_CLAIMED',
            message: 'Campaign already claimed',
            status: 409,
          });
        }
        throw error;
      }
      await this.usersService.applyPointChange(userId, totalReward, manager);
      return {
        campaign_reward: campaignReward,
        task_reward_total: taskRewardTotal,
        total: totalReward,
        claimed_at: claim.claimedAt,
      };
    });
  }

  private isTaskCompleted(status: UserTaskStatus) {
    return status === UserTaskStatus.Approved || status === UserTaskStatus.Completed;
  }

  private isUniqueViolation(error: unknown) {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as { code?: string };
    return driverError?.code === '23505';
  }
}
