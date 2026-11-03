import { Module } from '@nestjs/common';

import { CatholicInstitutionsService } from 'src/engine/core-modules/catholic-institutions/catholic-institutions.service';

// Config is a single DSN in the server/worker env (CATHOLIC_DB_URL), so this
// module has no imports. CatholicInstitutionsService is exported so the
// CatholicInstitutionsToolProvider can surface the search tools to the copilot.
@Module({
  providers: [CatholicInstitutionsService],
  exports: [CatholicInstitutionsService],
})
export class CatholicInstitutionsModule {}
