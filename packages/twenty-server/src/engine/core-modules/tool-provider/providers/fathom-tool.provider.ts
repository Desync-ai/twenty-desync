import { Injectable, Logger } from '@nestjs/common';

import { ToolCategory } from 'twenty-shared/ai';

import { FathomService } from 'src/engine/core-modules/fathom/fathom.service';
import { type GenerateDescriptorOptions } from 'src/engine/core-modules/tool-provider/interfaces/generate-descriptor-options.type';
import { type ToolProvider } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider.interface';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { type ToolDescriptor } from 'src/engine/core-modules/tool-provider/types/tool-descriptor.type';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { humanizeToolName } from 'src/engine/core-modules/tool-provider/utils/tool-set-to-descriptors.util';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';

// Surfaces a connected user's Fathom (fathom.video) meeting tools to the copilot,
// straight from Fathom's own MCP server (NOT Composio). Only users who connected
// a Fathom API key contribute tools. Flows into the agent catalog automatically
// (ToolRegistryService iterates all TOOL_PROVIDERS) and executes via the existing
// execute_tool path; no change to chat-execution.
@Injectable()
export class FathomToolProvider implements ToolProvider {
  readonly category = ToolCategory.FATHOM;
  private readonly logger = new Logger(FathomToolProvider.name);

  constructor(private readonly fathomService: FathomService) {}

  async isAvailable(context: ToolProviderContext): Promise<boolean> {
    if (!context.userId) {
      return false;
    }

    return this.fathomService.isConnected(context.userId);
  }

  async generateDescriptors(
    context: ToolProviderContext,
    options?: GenerateDescriptorOptions,
  ): Promise<(ToolIndexEntry | ToolDescriptor)[]> {
    if (!context.userId) {
      return [];
    }
    const includeSchemas = options?.includeSchemas ?? true;
    const tools = await this.fathomService.listTools(context.userId);

    return tools.map(({ name, description, inputSchema }) => {
      const base: ToolIndexEntry = {
        name,
        label: humanizeToolName(name),
        description,
        category: ToolCategory.FATHOM,
        executionRef: { kind: 'static' as const, toolId: name },
      };

      if (!includeSchemas) {
        return base;
      }

      return {
        ...base,
        inputSchema: inputSchema ?? { type: 'object', properties: {} },
      };
    });
  }

  async executeStaticTool(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolProviderContext,
  ): Promise<ToolOutput> {
    if (!context.userId) {
      return {
        success: false,
        message: 'No authenticated user in context',
        error: 'NO_USER',
      };
    }

    const result = await this.fathomService.execute(
      context.userId,
      toolName,
      args,
    );

    if (!result.ok) {
      return {
        success: false,
        message: result.error ?? 'Fathom tool execution failed',
        error: result.error,
      };
    }

    return {
      success: true,
      message: `Executed ${toolName}`,
      result: (result.data ?? {}) as object,
    };
  }
}
