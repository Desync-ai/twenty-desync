import { Injectable, Logger } from '@nestjs/common';

import { ToolCategory } from 'twenty-shared/ai';

import { ComposioService } from 'src/engine/core-modules/composio/composio.service';
import { type GenerateDescriptorOptions } from 'src/engine/core-modules/tool-provider/interfaces/generate-descriptor-options.type';
import { type ToolProvider } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider.interface';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { type ToolDescriptor } from 'src/engine/core-modules/tool-provider/types/tool-descriptor.type';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { humanizeToolName } from 'src/engine/core-modules/tool-provider/utils/tool-set-to-descriptors.util';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';

// Surfaces the connected user's Composio tools (Slack, Airtable, …) to the
// copilot. Only toolkits the user has actually connected contribute tools. It
// flows into the agent's tool catalog automatically (ToolRegistryService iterates
// all TOOL_PROVIDERS) and executes via the existing execute_tool path — so no
// change to chat-execution.service.ts is needed.
@Injectable()
export class ComposioToolProvider implements ToolProvider {
  readonly category = ToolCategory.COMPOSIO;
  private readonly logger = new Logger(ComposioToolProvider.name);

  constructor(private readonly composioService: ComposioService) {}

  async isAvailable(context: ToolProviderContext): Promise<boolean> {
    if (!this.composioService.isConfigured || !context.userId) {
      return false;
    }

    const connected = await this.composioService.getConnectedToolkits(
      context.userId,
    );

    return connected.size > 0;
  }

  async generateDescriptors(
    context: ToolProviderContext,
    options?: GenerateDescriptorOptions,
  ): Promise<(ToolIndexEntry | ToolDescriptor)[]> {
    if (!context.userId) {
      return [];
    }
    const includeSchemas = options?.includeSchemas ?? true;
    const tools = await this.composioService.getToolsForUser(context.userId);
    const schemas = includeSchemas
      ? await this.composioService.getToolSchemas()
      : {};

    return tools.map(({ slug, description }) => {
      const base: ToolIndexEntry = {
        name: slug,
        label: humanizeToolName(slug),
        description,
        category: ToolCategory.COMPOSIO,
        executionRef: { kind: 'static' as const, toolId: slug },
      };

      if (!includeSchemas) {
        return base;
      }

      return {
        ...base,
        inputSchema: schemas[slug] ?? { type: 'object', properties: {} },
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

    const result = await this.composioService.execute(
      context.userId,
      toolName,
      args,
    );

    if (!result.ok) {
      return {
        success: false,
        message: result.error ?? 'Composio tool execution failed',
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
