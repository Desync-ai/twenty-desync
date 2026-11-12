import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { ToolCategory } from 'twenty-shared/ai';
import { FeatureFlagKey } from 'twenty-shared/types';

import { EntitlementService } from 'src/engine/core-modules/auth/services/entitlement.service';
import {
  CatholicInstitutionsService,
  type CatholicInstitutionsQueryResult,
} from 'src/engine/core-modules/catholic-institutions/catholic-institutions.service';
import {
  CATHOLIC_INSTITUTIONS_TOOL_SPECS,
  SEARCH_CATHOLIC_HOSPITALS_TOOL_NAME,
  SEARCH_CATHOLIC_PARISHES_TOOL_NAME,
  SEARCH_CATHOLIC_SCHOOLS_TOOL_NAME,
} from 'src/engine/core-modules/catholic-institutions/constants/catholic-institutions-tools.constant';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { type GenerateDescriptorOptions } from 'src/engine/core-modules/tool-provider/interfaces/generate-descriptor-options.type';
import { type ToolProvider } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider.interface';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { type ToolDescriptor } from 'src/engine/core-modules/tool-provider/types/tool-descriptor.type';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';

// Desync fork: surfaces read-only search tools over our own Catholic
// institutions reference data (the `compat` views of `desync_core`). Gated three
// ways — CATHOLIC_DB_URL must be set, the workspace must have the
// IS_CATHOLIC_INSTITUTIONS_ENABLED flag on (a self-serve public flag any entitled
// member can toggle from the AI settings tab), AND the requesting user must be
// entitled (free trial / paid plan / admin). Flows into the agent catalog
// automatically (ToolRegistryService iterates all TOOL_PROVIDERS) and executes
// via the existing execute_tool path.
@Injectable()
export class CatholicInstitutionsToolProvider implements ToolProvider {
  readonly category = ToolCategory.CATHOLIC_INSTITUTIONS;
  private readonly logger = new Logger(CatholicInstitutionsToolProvider.name);

  constructor(
    private readonly catholicInstitutionsService: CatholicInstitutionsService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly entitlementService: EntitlementService,
  ) {}

  async isAvailable(context: ToolProviderContext): Promise<boolean> {
    if (!this.catholicInstitutionsService.isConfigured()) {
      return false;
    }

    const flagEnabled = await this.featureFlagService.isFeatureEnabled(
      FeatureFlagKey.IS_CATHOLIC_INSTITUTIONS_ENABLED,
      context.workspaceId,
    );

    if (!flagEnabled) {
      return false;
    }

    // The flag is self-serve, so re-check entitlement here: the DB tools only
    // expose to users who may use the product (free trial, paid plan, or admin /
    // @desync.ai). Non-user callers (API key / application / system) carry no
    // user email to check and pass through — their workspace already exists,
    // which implies an entitled owner.
    const authContext = context.authContext;

    if (
      authContext?.type === 'user' ||
      authContext?.type === 'pendingActivationUser'
    ) {
      const email = authContext.user.email;

      if (!isNonEmptyString(email)) {
        return false;
      }

      return this.entitlementService.isEntitled(
        email,
        authContext.user.clerkId ?? '',
      );
    }

    return true;
  }

  async generateDescriptors(
    _context: ToolProviderContext,
    options?: GenerateDescriptorOptions,
  ): Promise<(ToolIndexEntry | ToolDescriptor)[]> {
    const includeSchemas = options?.includeSchemas ?? true;

    return CATHOLIC_INSTITUTIONS_TOOL_SPECS.map(
      ({ name, label, description, inputSchema }) => {
        const base: ToolIndexEntry = {
          name,
          label,
          description,
          category: ToolCategory.CATHOLIC_INSTITUTIONS,
          executionRef: { kind: 'static' as const, toolId: name },
        };

        if (!includeSchemas) {
          return base;
        }

        return { ...base, inputSchema };
      },
    );
  }

  async executeStaticTool(
    toolName: string,
    args: Record<string, unknown>,
    _context: ToolProviderContext,
  ): Promise<ToolOutput> {
    try {
      const result = await this.runTool(toolName, args);

      if (!result) {
        return {
          success: false,
          message: `Unknown Catholic institutions tool: ${toolName}`,
          error: 'UNKNOWN_TOOL',
        };
      }

      return {
        success: true,
        message: `Found ${result.count} result(s) from ${result.source}`,
        result,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Catholic institutions query failed';

      this.logger.error(`Execution of ${toolName} failed: ${message}`);

      return {
        success: false,
        message,
        error: 'CATHOLIC_INSTITUTIONS_QUERY_FAILED',
      };
    }
  }

  private async runTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CatholicInstitutionsQueryResult | null> {
    switch (toolName) {
      case SEARCH_CATHOLIC_PARISHES_TOOL_NAME:
        return this.catholicInstitutionsService.searchParishes(args);
      case SEARCH_CATHOLIC_SCHOOLS_TOOL_NAME:
        return this.catholicInstitutionsService.searchSchools(args);
      case SEARCH_CATHOLIC_HOSPITALS_TOOL_NAME:
        return this.catholicInstitutionsService.searchHospitals(args);
      default:
        return null;
    }
  }
}
