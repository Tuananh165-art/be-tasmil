import { MigrationInterface, QueryRunner } from 'typeorm';

export default class SocialTasks1710860000000 implements MigrationInterface {
  name = 'SocialTasks1710860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "campaigns" RENAME COLUMN "reward_points" TO "reward_point_campaign"`,
    );

    await queryRunner.query(`ALTER TABLE "tasks" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type typ
          JOIN pg_enum enum ON enum.enumtypid = typ.oid
          WHERE typ.typname = 'task_type_enum' AND enum.enumlabel = 'telegram_join'
        ) THEN
          ALTER TYPE "public"."task_type_enum" ADD VALUE 'telegram_join';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_type typ
          JOIN pg_enum enum ON enum.enumtypid = typ.oid
          WHERE typ.typname = 'task_type_enum' AND enum.enumlabel = 'twitter_follow'
        ) THEN
          ALTER TYPE "public"."task_type_enum" ADD VALUE 'twitter_follow';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_type typ
          JOIN pg_enum enum ON enum.enumtypid = typ.oid
          WHERE typ.typname = 'task_type_enum' AND enum.enumlabel = 'twitter_like'
        ) THEN
          ALTER TYPE "public"."task_type_enum" ADD VALUE 'twitter_like';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_type typ
          JOIN pg_enum enum ON enum.enumtypid = typ.oid
          WHERE typ.typname = 'task_type_enum' AND enum.enumlabel = 'twitter_retweet'
        ) THEN
          ALTER TYPE "public"."task_type_enum" ADD VALUE 'twitter_retweet';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_type typ
          JOIN pg_enum enum ON enum.enumtypid = typ.oid
          WHERE typ.typname = 'task_type_enum' AND enum.enumlabel = 'discord_join'
        ) THEN
          ALTER TYPE "public"."task_type_enum" ADD VALUE 'discord_join';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE "user_social_accounts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "provider" varchar(50) NOT NULL,
        "external_user_id" varchar(255) NOT NULL,
        "access_token" text NOT NULL,
        "refresh_token" text,
        "expires_at" timestamptz,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_user_social_provider" UNIQUE ("user_id", "provider"),
        CONSTRAINT "fk_user_social_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_user_social_accounts_user_id" ON "user_social_accounts" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_social_accounts_user_id"`);
    await queryRunner.query(`DROP TABLE "user_social_accounts"`);
    await queryRunner.query(
      `ALTER TABLE "campaigns" RENAME COLUMN "reward_point_campaign" TO "reward_points"`,
    );
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "config"`);
    // Enum values remain available and do not need to be removed.
  }
}
