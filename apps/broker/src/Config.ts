import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { loadBrokerEnv } from './Env.js';

export const BrokerConfigSchema = z
  .strictObject({
    port: z.number().int().min(1024).max(65535).default(4318),
    databasePath: z.string().min(1),
    ownerToken: z.string().min(32),
    agents: z.array(z.strictObject({ id: z.string().min(1), token: z.string().min(32) })).min(1),
  })
  .superRefine((config, context) => {
    /*
     * Sharing tokens would collapse owner/agent roles or make agent identity
     * ambiguous. Unique actor IDs also keep request ownership unambiguous.
     */
    const tokens = [config.ownerToken, ...config.agents.map((agent) => agent.token)];

    if (
      new Set(tokens).size !== tokens.length ||
      new Set(config.agents.map((agent) => agent.id)).size !== config.agents.length
    ) {
      context.addIssue({ code: 'custom', message: 'Credentials and actor IDs must be distinct' });
    }
  });

export type BrokerConfig = z.infer<typeof BrokerConfigSchema>;

export function loadConfig(path = loadBrokerEnv().FEATHERLANE_BROKER_CONFIG): BrokerConfig {
  const fileContents: unknown = JSON.parse(readFileSync(path, 'utf8'));

  return BrokerConfigSchema.parse(fileContents);
}
