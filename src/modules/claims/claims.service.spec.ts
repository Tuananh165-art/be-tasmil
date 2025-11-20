import { QueryFailedError, DataSource } from 'typeorm';
import { ClaimsService } from './claims.service';
import { TaskClaim } from './entities/task-claim.entity';
import { CampaignClaim } from './entities/campaign-claim.entity';
import { UserTask } from '../user-tasks/entities/user-task.entity';
import { Task } from '../social-tasks/entities/task.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { UsersService } from '../users/users.service';
import { UserTaskStatus } from '../../common/enums/user-task-status.enum';
import { BusinessException } from '../../common/exceptions/business.exception';

const createQueryFailedError = () => new QueryFailedError('', [], { code: '23505' } as any);

describe('ClaimsService', () => {
  const userTask: Partial<UserTask> = {
    id: 'user-task-1',
    userId: 'user-1',
    campaignId: 'camp-1',
    taskId: 'task-1',
    status: UserTaskStatus.Approved,
    pointsEarned: 0,
    task: { rewardPointTask: 100 } as Task,
  };

  const userTaskRepository = {
    findOne: jest.fn().mockResolvedValue(userTask),
    save: jest.fn().mockResolvedValue(userTask),
    find: jest.fn(),
    count: jest.fn(),
  };

  const taskClaimRepository = {
    create: jest.fn().mockImplementation((payload: any) => payload),
    save: jest
      .fn()
      .mockResolvedValueOnce({ id: 'claim-1' })
      .mockImplementationOnce(() => {
        throw createQueryFailedError();
      }),
  };

  const campaignClaimRepository = {
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((payload: any) => payload),
    save: jest.fn().mockImplementation((payload: any) => ({
      ...payload,
      claimedAt: new Date('2024-01-01T00:00:00Z'),
    })),
  };
  const taskRepository = {
    find: jest.fn(),
  };
  const campaignRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'camp-1',
      rewardPointCampaign: 50,
    }),
  };
  const usersService = {
    applyPointChange: jest.fn().mockResolvedValue(undefined),
  } as unknown as UsersService;

  const repoMap = new Map<any, any>([
    [UserTask, userTaskRepository],
    [Task, taskRepository],
    [Campaign, campaignRepository],
    [TaskClaim, taskClaimRepository],
    [CampaignClaim, campaignClaimRepository],
  ]);

  const dataSource = {
    transaction: (cb: (manager: any) => Promise<any>) =>
      cb({
        getRepository: (entity: any) => repoMap.get(entity),
      }),
  } as unknown as DataSource;

  const claimsService = new ClaimsService(
    taskClaimRepository as any,
    campaignClaimRepository as any,
    userTaskRepository as any,
    taskRepository as any,
    campaignRepository as any,
    usersService,
    dataSource,
  );

  it('prevents double task claims', async () => {
    await claimsService.claimTask('user-1', 'task-1');
    await expect(claimsService.claimTask('user-1', 'task-1')).rejects.toThrow(BusinessException);
  });
});

it('sums task and campaign rewards when claiming campaign', async () => {
  taskRepository.find.mockResolvedValue([
    { id: 'task-1', rewardPointTask: 10 },
    { id: 'task-2', rewardPointTask: 20 },
  ]);
  userTaskRepository.find.mockResolvedValue([
    {
      taskId: 'task-1',
      status: UserTaskStatus.Completed,
      pointsEarned: 10,
    },
    {
      taskId: 'task-2',
      status: UserTaskStatus.Approved,
      pointsEarned: 0,
    },
  ]);
  campaignClaimRepository.findOne.mockResolvedValue(null);

  const result = await claimsService.claimCampaign('user-1', 'camp-1');

  expect(result).toEqual({
    campaign_reward: 50,
    task_reward_total: 30,
    total: 80,
    claimed_at: new Date('2024-01-01T00:00:00Z'),
  });
  expect(usersService.applyPointChange).toHaveBeenCalledWith('user-1', 80, expect.anything());
});
