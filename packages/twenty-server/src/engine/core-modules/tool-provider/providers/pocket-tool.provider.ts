import { Injectable, Logger } from '@nestjs/common';

import { ToolCategory } from 'twenty-shared/ai';

import { PocketService } from 'src/engine/core-modules/pocket/pocket.service';
import { type GenerateDescriptorOptions } from 'src/engine/core-modules/tool-provider/interfaces/generate-descriptor-options.type';
import { type ToolProvider } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider.interface';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { type ToolDescriptor } from 'src/engine/core-modules/tool-provider/types/tool-descriptor.type';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { humanizeToolName } from 'src/engine/core-modules/tool-provider/utils/tool-set-to-descriptors.util';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';

// Surfaces a connected user's Pocket (heypocketai.com) meeting-capture tools to
// the copilot, straight from Pocket's own MCP server (NOT Composio). Only users
// who connected a Pocket API key contribute tools. It flows into the agent's
// catalog automatically (ToolRegistryService iterates all TOOL_PROVIDERS) and
// executes via the existing execute_tool path; no change to chat-execution.
@Injectable()
export class PocketToolProvider implements ToolProvider {
  readonly category = ToolCategory.POCKET;
  private readonly logger = new Logger(PocketToolProvider.name);

  constructor(private readonly pocketService: PocketService) {}

  async isAvailable(context: ToolProviderContext): Promise<boolean> {
    if (!context.userId) {
      return false;
    }

    return this.pocketService.isConnected(context.userId);
  }

  async generateDescriptors(
    context: ToolProviderContext,
    options?: GenerateDescriptorOptions,
  ): Promise<(ToolIndexEntry | ToolDescriptor)[]> {
    if (!context.userId) {
      return [];
    }
    const includeSchemas = options?.includeSchemas ?? true;
    const tools = await this.pocketService.listTools(context.userId);

    return tools.map(({ name, description, inputSchema }) => {
      const base: ToolIndexEntry = {
        name,
        label: humanizeToolName(name),
        description,
        category: ToolCategory.POCKET,
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

    const result = await this.pocketService.execute(
      context.userId,
      toolName,
      args,
    );

    if (!result.ok) {
      return {
        success: false,
        message: result.error ?? 'Pocket tool execution failed',
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
