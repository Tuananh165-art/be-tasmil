import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TaskType } from '../../../common/enums/task-type.enum';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TaskVerifier, VerifyTaskPayload, VerifyTaskResult } from './task-verifier.interface';

type TwitterUser = { id: string; username?: string };
type TwitterTweet = { id: string };

@Injectable()
export class TwitterVerifierService implements TaskVerifier {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  supports(type: TaskType): boolean {
    return [
      TaskType.TwitterFollow,
      TaskType.TwitterLike,
      TaskType.TwitterRetweet,
      TaskType.X,
    ].includes(type);
  }

  async verify(payload: VerifyTaskPayload): Promise<VerifyTaskResult> {
    const taskType = payload.task.type;
    if (!taskType) {
      throw new BusinessException({
        code: 'TASK_TYPE_REQUIRED',
        message: 'Task type missing on Twitter verifier',
        status: 400,
      });
    }
    switch (taskType) {
      case TaskType.TwitterFollow:
        return this.verifyFollow(payload);
      case TaskType.TwitterLike:
        return this.verifyLike(payload);
      case TaskType.TwitterRetweet:
        return this.verifyRetweet(payload);
      case TaskType.X:
        return this.verifyFollow(payload);
      default:
        throw new BusinessException({
          code: 'UNSUPPORTED_TWITTER_TASK',
          message: `Unsupported twitter task type ${taskType}`,
          status: 400,
        });
    }
  }

  private async verifyFollow(payload: VerifyTaskPayload): Promise<VerifyTaskResult> {
    const targetUserId = await this.resolveTargetUserId(payload);
    const data = await this.requestTwitter<{ data?: TwitterUser[] }>(
      `/users/${payload.account.externalUserId}/following`,
      payload.account.accessToken,
      { max_results: 1000 },
    );
    const followed = Boolean(data.data?.some((user) => user.id === targetUserId));
    return {
      success: followed,
      proof: followed ? { targetUserId } : undefined,
    };
  }

  private async verifyLike(payload: VerifyTaskPayload): Promise<VerifyTaskResult> {
    const tweetId = this.extractTweetId(payload);
    const data = await this.requestTwitter<{ data?: TwitterTweet[] }>(
      `/users/${payload.account.externalUserId}/liked_tweets`,
      payload.account.accessToken,
      { max_results: 100 },
    );
    const liked = Boolean(data.data?.some((tweet) => tweet.id === tweetId));
    return {
      success: liked,
      proof: liked ? { tweetId } : undefined,
    };
  }

  private async verifyRetweet(payload: VerifyTaskPayload): Promise<VerifyTaskResult> {
    const tweetId = this.extractTweetId(payload);
    const data = await this.requestTwitter<{ data?: TwitterTweet[] }>(
      `/users/${payload.account.externalUserId}/retweeted_tweets`,
      payload.account.accessToken,
      { max_results: 100 },
    );
    const retweeted = Boolean(data.data?.some((tweet) => tweet.id === tweetId));
    return {
      success: retweeted,
      proof: retweeted ? { tweetId } : undefined,
    };
  }

  private extractTweetId(payload: VerifyTaskPayload) {
    const tweetId = payload.task.config?.tweetId;
    if (!tweetId) {
      throw new BusinessException({
        code: 'TWITTER_TWEET_REQUIRED',
        message: 'Task configuration missing tweetId',
        status: 400,
      });
    }
    return tweetId;
  }

  private async resolveTargetUserId(payload: VerifyTaskPayload) {
    const config = payload.task.config || {};
    if (config.userId) {
      return config.userId;
    }
    if (!config.username) {
      throw new BusinessException({
        code: 'TWITTER_USERNAME_REQUIRED',
        message: 'Task configuration missing username or userId',
        status: 400,
      });
    }
    const response = await this.requestTwitter<{ data?: TwitterUser }>(
      `/users/by/username/${config.username}`,
      payload.account.accessToken,
    );
    if (!response.data?.id) {
      throw new BusinessException({
        code: 'TWITTER_USER_NOT_FOUND',
        message: `Unable to resolve twitter username ${config.username}`,
        status: 400,
      });
    }
    return response.data.id;
  }

  private async requestTwitter<T>(
    path: string,
    accessToken: string,
    params?: Record<string, any>,
  ): Promise<T> {
    const apiBase =
      this.configService.get<string>('social.twitter.apiBaseUrl') || 'https://api.twitter.com/2';
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(`${apiBase}${path}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params,
        }),
      );
      return response.data;
    } catch (error) {
      throw new BusinessException({
        code: 'TWITTER_API_ERROR',
        message: 'Twitter API request failed',
        status: 400,
      });
    }
  }
}
