import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { loadCliEnv } from './env.js';

const AgentConfigSchema = z.strictObject({
  baseUrl: z.url(),
  token: z.string().min(32),
});

/**
 * Environment validation selects a config file; JSON parsing and schema validation
 * separately check its contents. This file contains the agent token, not the owner
 * token. Errors deliberately omit file contents and raw parser/validation details.
 */
export function loadAgentConfig(configPath = loadCliEnv().FEATHERLANE_AGENT_CONFIG) {
  try {
    const fileContents = readFileSync(configPath, 'utf8');
    const parsedConfig: unknown = JSON.parse(fileContents);

    return AgentConfigSchema.parse(parsedConfig);
  } catch {
    throw new Error('Could not load agent configuration; check the file and its contents');
  }
}
