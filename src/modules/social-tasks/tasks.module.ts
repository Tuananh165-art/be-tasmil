import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { Task } from './entities/task.entity';
import { TaskClaim } from '../claims/entities/task-claim.entity';
import { UserTasksModule } from '../user-tasks/user-tasks.module';
import { ClaimsModule } from '../claims/claims.module';
import { UserTask } from '../user-tasks/entities/user-task.entity';
import { UserSocialAccount } from './entities/user-social-account.entity';
import { SocialAuthController } from './social-auth.controller';
import { SocialAuthService } from './social-auth.service';
import { UserTaskStatusService } from './user-task-status.service';
import { TaskVerifierFactory } from './verifiers/task-verifier.factory';
import { TelegramVerifierService } from './verifiers/telegram-verifier.service';
import { TwitterVerifierService } from './verifiers/twitter-verifier.service';
import { DiscordVerifierService } from './verifiers/discord-verifier.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskClaim, UserTask, UserSocialAccount]),
    UserTasksModule,
    ClaimsModule,
    HttpModule,
  ],
  controllers: [TasksController, SocialAuthController],
  providers: [
    TasksService,
    SocialAuthService,
    UserTaskStatusService,
    TaskVerifierFactory,
    TelegramVerifierService,
    TwitterVerifierService,
    DiscordVerifierService,
  ],
  exports: [TasksService, SocialAuthService],
})
export class SocialTasksModule {}
