import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { ClaimsService } from '../claims/claims.service';
import { TaskClaim } from '../claims/entities/task-claim.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { UserTaskStatusService } from './user-task-status.service';
import { SocialAuthService } from './social-auth.service';
import { TaskVerifierFactory } from './verifiers/task-verifier.factory';
import { UserTaskStatus } from '../../common/enums/user-task-status.enum';
import { UserTask } from '../user-tasks/entities/user-task.entity';
import { TaskType } from '../../common/enums/task-type.enum';
import { SocialProvider } from '../../common/enums/social-provider.enum';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(TaskClaim)
    private readonly taskClaimRepository: Repository<TaskClaim>,
    private readonly claimsService: ClaimsService,
    private readonly userTaskStatusService: UserTaskStatusService,
    private readonly socialAuthService: SocialAuthService,
    private readonly taskVerifierFactory: TaskVerifierFactory,
  ) {}

  async getTask(taskId: string, userId?: string | null) {
    const task = await this.findTaskOrFail(taskId);
    const status = userId ? await this.userTaskStatusService.getStatus(userId, taskId) : null;
    return {
      task,
      userStatus: this.toPublicStatus(status),
      completedAt: status?.completedAt ?? null,
    };
  }

  async verifyTask(userId: string, taskId: string) {
    const task = await this.findTaskOrFail(taskId);
    const provider = this.resolveProvider(task.type);
    const account = await this.socialAuthService.getAccountOrThrow(userId, provider);
    const verifier = this.taskVerifierFactory.getVerifier(task.type);
    const result = await verifier.verify({ task, account });
    if (!result.success) {
      throw new BusinessException({
        code: 'TASK_NOT_COMPLETED',
        message: 'Verification failed. Please complete the task and try again.',
        status: 400,
      });
    }
    const userTask = await this.userTaskStatusService.markCompleted(
      userId,
      task,
      result.proof ?? null,
    );
    return {
      taskId,
      status: this.toPublicStatus(userTask),
      completedAt: userTask.completedAt,
      proof: result.proof ?? undefined,
      reward: task.rewardPointTask,
    };
  }

  async getUserTaskStatus(userId: string, taskId: string) {
    const userTask = await this.userTaskStatusService.getStatus(userId, taskId);
    return {
      status: this.toPublicStatus(userTask),
      completedAt: userTask?.completedAt ?? null,
    };
  }

  async claimTask(userId: string, taskId: string) {
    return this.claimsService.claimTask(userId, taskId);
  }

  async getClaimStatus(userId: string, taskId: string) {
    const claim = await this.taskClaimRepository.findOne({
      where: { userId, taskId },
    });
    return {
      claimed: Boolean(claim),
      claim,
    };
  }

  private async findTaskOrFail(taskId: string) {
    const task = await this.taskRepository.findOne({
      where: { id: taskId },
    });
    if (!task) {
      throw new BusinessException({
        code: 'TASK_NOT_FOUND',
        message: 'Task not found',
        status: 404,
      });
    }
    return task;
  }

  private toPublicStatus(userTask?: UserTask | null) {
    if (!userTask) {
      return UserTaskStatus.Pending;
    }
    if (
      userTask.status === UserTaskStatus.Completed ||
      userTask.status === UserTaskStatus.Approved
    ) {
      return 'completed';
    }
    if (userTask.status === UserTaskStatus.Rejected) {
      return 'rejected';
    }
    return userTask.status;
  }

  private resolveProvider(type?: TaskType | null): SocialProvider {
    switch (type) {
      case TaskType.TelegramJoin:
      case TaskType.Telegram:
        return SocialProvider.Telegram;
      case TaskType.DiscordJoin:
      case TaskType.Discord:
        return SocialProvider.Discord;
      case TaskType.X:
      case TaskType.TwitterFollow:
      case TaskType.TwitterLike:
      case TaskType.TwitterRetweet:
        return SocialProvider.Twitter;
      default:
        throw new BusinessException({
          code: 'UNSUPPORTED_TASK_TYPE',
          message: 'Task type is not supported for verification',
          status: 400,
        });
    }
  }
}
