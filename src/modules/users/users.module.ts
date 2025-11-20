import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { TaskClaim } from '../claims/entities/task-claim.entity';
import { CampaignClaim } from '../claims/entities/campaign-claim.entity';
import { ReferralEvent } from '../claims/entities/referral-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, TaskClaim, CampaignClaim, ReferralEvent])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
