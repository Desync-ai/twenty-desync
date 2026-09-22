import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.41.0', 1789600000000)
export class AddClerkIdToUserFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."user" ADD COLUMN IF NOT EXISTS "clerkId" varchar',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_USER_CLERK_ID_UNIQUE" ON "core"."user" ("clerkId") WHERE "clerkId" IS NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "core"."IDX_USER_CLERK_ID_UNIQUE"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."user" DROP COLUMN IF EXISTS "clerkId"',
    );
  }
}
