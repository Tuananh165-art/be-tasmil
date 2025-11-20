import { Task } from '../entities/task.entity';
import { UserSocialAccount } from '../entities/user-social-account.entity';
import { TaskType } from '../../../common/enums/task-type.enum';

export interface VerifyTaskPayload {
  task: Task;
  account: UserSocialAccount;
}

export interface VerifyTaskResult {
  success: boolean;
  proof?: Record<string, any>;
}

export interface TaskVerifier {
  supports(type: TaskType): boolean;
  verify(payload: VerifyTaskPayload): Promise<VerifyTaskResult>;
}
