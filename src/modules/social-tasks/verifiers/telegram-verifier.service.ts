import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TaskType } from '../../../common/enums/task-type.enum';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TaskVerifier, VerifyTaskPayload, VerifyTaskResult } from './task-verifier.interface';

@Injectable()
export class TelegramVerifierService implements TaskVerifier {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  supports(type: TaskType): boolean {
    return type === TaskType.TelegramJoin || type === TaskType.Telegram;
  }

  async verify(payload: VerifyTaskPayload): Promise<VerifyTaskResult> {
    const botToken = this.configService.get<string>('social.telegram.botToken');
    if (!botToken) {
      throw new BusinessException({
        code: 'TELEGRAM_BOT_TOKEN_MISSING',
        message: 'Telegram bot token is not configured',
        status: 500,
      });
    }
    const groupId = payload.task.config?.groupId;
    if (!groupId) {
      throw new BusinessException({
        code: 'TELEGRAM_GROUP_REQUIRED',
        message: 'Task configuration is missing Telegram groupId',
        status: 400,
      });
    }
    try {
      const url = `https://api.telegram.org/bot${botToken}/getChatMember`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            chat_id: groupId,
            user_id: payload.account.externalUserId,
          },
        }),
      );
      const status = response.data?.result?.status;
      const success = ['member', 'administrator', 'creator'].includes(status);
      return {
        success,
        proof: { status },
      };
    } catch (error) {
      throw new BusinessException({
        code: 'TELEGRAM_VERIFICATION_FAILED',
        message: 'Failed to verify Telegram membership',
        status: 400,
      });
    }
  }
}
