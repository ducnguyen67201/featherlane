import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import type { FeatherlaneClient } from '@featherlane/client';
import { RequestInputSchema } from '@featherlane/contracts';

/**
 * Exposes only agent capabilities to MCP hosts. Approval stays in the owner API;
 * giving an agent an approval tool would defeat that separation. Tool failures use
 * a safe message because their text can become part of a model's conversation.
 */
export function createMcpServer(client: FeatherlaneClient): McpServer {
  const server = new McpServer({ name: 'featherlane', version: '0.1.0' });

  const result = async (work: () => Promise<unknown>) => {
    try {
      return { content: [{ type: 'text' as const, text: JSON.stringify(await work()) }] };
    } catch {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: 'Broker request failed. Check access and request status.',
          },
        ],
      };
    }
  };

  server.registerTool(
    'list_connections',
    {
      description: 'List synthetic demo accounts and policies; no credentials.',
      inputSchema: z.strictObject({}),
    },
    () => result(() => client.connections()),
  );

  server.registerTool(
    'request_access',
    {
      description:
        'Request a synthetic grant. Pending requests require owner approval. A grant is NOT a browser session.',
      inputSchema: RequestInputSchema,
    },
    (input) => result(() => client.requestAccess(input)),
  );

  server.registerTool(
    'access_status',
    {
      description: 'Read your own synthetic request status.',
      inputSchema: z.strictObject({ id: z.uuid() }),
    },
    ({ id }) => result(() => client.getAccess(id)),
  );

  server.registerTool(
    'release_access',
    {
      description: 'Revoke your own synthetic grant.',
      inputSchema: z.strictObject({ id: z.uuid() }),
    },
    ({ id }) => result(() => client.releaseAccess(id)),
  );

  return server;
}

/** Keep stdout reserved for MCP protocol messages; operational logs belong on stderr. */
export async function runMcp(client: FeatherlaneClient): Promise<void> {
  await createMcpServer(client).connect(new StdioServerTransport());
}
