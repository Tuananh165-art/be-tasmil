import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserTask } from '../user-tasks/entities/user-task.entity';
import { Task } from './entities/task.entity';
import { UserTaskStatus } from '../../common/enums/user-task-status.enum';

@Injectable()
export class UserTaskStatusService {
  constructor(
    @InjectRepository(UserTask)
    private readonly userTaskRepository: Repository<UserTask>,
  ) {}

  async getStatus(userId: string, taskId: string) {
    return this.userTaskRepository.findOne({ where: { userId, taskId } });
  }

  async getStatusesForTasks(userId: string, taskIds: string[]) {
    if (!taskIds.length) {
      return [];
    }
    return this.userTaskRepository.find({
      where: {
        userId,
        taskId: In(taskIds),
      },
    });
  }

  async markCompleted(userId: string, task: Task, proof?: Record<string, any> | null) {
    let userTask = await this.userTaskRepository.findOne({
      where: { userId, taskId: task.id },
    });
    if (!userTask) {
      userTask = this.userTaskRepository.create({
        userId,
        campaignId: task.campaignId,
        taskId: task.id,
      });
    }
    userTask.status = UserTaskStatus.Completed;
    userTask.completedAt = new Date();
    userTask.pointsEarned = task.rewardPointTask;
    userTask.proofData = proof ? JSON.stringify(proof) : userTask.proofData;
    return this.userTaskRepository.save(userTask);
  }
}
