import { MigrationInterface, QueryRunner } from 'typeorm';

export default class AddUserEmail1710900000000 implements MigrationInterface {
  name = 'AddUserEmail1710900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "email" character varying(255)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_email_unique" ON "users" ("email") WHERE email IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email_unique"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email"`);
  }
}
