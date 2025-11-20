import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { SocialProvider } from '../../../common/enums/social-provider.enum';
import { TIMESTAMP_COLUMN_TYPE } from '../../../common/utils/column-type.util';

@Entity({ name: 'user_social_accounts' })
@Unique('uq_user_social_provider', ['userId', 'provider'])
export class UserSocialAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  @Index('idx_user_social_accounts_user_id')
  userId!: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'provider',
  })
  provider!: SocialProvider;

  @Column({ type: 'varchar', length: 255, name: 'external_user_id' })
  externalUserId!: string;

  @Column({ type: 'text', name: 'access_token' })
  accessToken!: string;

  @Column({ type: 'text', name: 'refresh_token', nullable: true })
  refreshToken?: string | null;

  @Column({ type: TIMESTAMP_COLUMN_TYPE, name: 'expires_at', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: TIMESTAMP_COLUMN_TYPE })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: TIMESTAMP_COLUMN_TYPE })
  updatedAt!: Date;
}
