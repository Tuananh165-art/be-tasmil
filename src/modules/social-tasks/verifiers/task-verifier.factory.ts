import { Injectable } from '@nestjs/common';
import { TaskType } from '../../../common/enums/task-type.enum';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TaskVerifier } from './task-verifier.interface';
import { TelegramVerifierService } from './telegram-verifier.service';
import { TwitterVerifierService } from './twitter-verifier.service';
import { DiscordVerifierService } from './discord-verifier.service';

@Injectable()
export class TaskVerifierFactory {
  private readonly verifiers: TaskVerifier[];

  constructor(
    telegramVerifier: TelegramVerifierService,
    twitterVerifier: TwitterVerifierService,
    discordVerifier: DiscordVerifierService,
  ) {
    this.verifiers = [telegramVerifier, twitterVerifier, discordVerifier];
  }

  getVerifier(type?: TaskType | null): TaskVerifier {
    if (!type) {
      throw new BusinessException({
        code: 'TASK_TYPE_REQUIRED',
        message: 'Task does not have a verifier type',
        status: 400,
      });
    }
    const verifier = this.verifiers.find((service) => service.supports(type));
    if (!verifier) {
      throw new BusinessException({
        code: 'VERIFIER_NOT_FOUND',
        message: `No verifier registered for task type ${type}`,
        status: 400,
      });
    }
    return verifier;
  }
}
