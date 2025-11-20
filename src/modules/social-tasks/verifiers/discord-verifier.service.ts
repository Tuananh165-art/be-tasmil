import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TaskType } from '../../../common/enums/task-type.enum';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TaskVerifier, VerifyTaskPayload, VerifyTaskResult } from './task-verifier.interface';

@Injectable()
export class DiscordVerifierService implements TaskVerifier {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  supports(type: TaskType): boolean {
    return type === TaskType.DiscordJoin || type === TaskType.Discord;
  }

  async verify(payload: VerifyTaskPayload): Promise<VerifyTaskResult> {
    const guildId = payload.task.config?.guildId ?? payload.task.config?.serverId;
    if (!guildId) {
      throw new BusinessException({
        code: 'DISCORD_GUILD_REQUIRED',
        message: 'Task configuration missing Discord guild/server id',
        status: 400,
      });
    }
    try {
      const apiBase =
        this.configService.get<string>('social.discord.apiBaseUrl') ?? 'https://discord.com/api';
      const response = await firstValueFrom(
        this.httpService.get(`${apiBase}/users/@me/guilds`, {
          headers: {
            Authorization: `Bearer ${payload.account.accessToken}`,
          },
        }),
      );
      const guilds: Array<{ id: string }> = response.data ?? [];
      const matched = guilds.some((guild) => guild.id === guildId);
      return {
        success: matched,
        proof: matched ? { guildId } : undefined,
      };
    } catch (error) {
      throw new BusinessException({
        code: 'DISCORD_VERIFICATION_FAILED',
        message: 'Failed to verify Discord guild membership',
        status: 400,
      });
    }
  }
}
