import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Campaign } from './entities/campaign.entity';
import { CampaignParticipation } from './entities/campaign-participation.entity';
import { Task } from '../tasks/entities/task.entity';
import { ClaimsModule } from '../claims/claims.module';
import { CampaignClaim } from '../claims/entities/campaign-claim.entity';
import { UserTask } from '../user-tasks/entities/user-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Campaign,
      CampaignParticipation,
      Task,
      CampaignClaim,
      UserTask,
    ]),
    ClaimsModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}

