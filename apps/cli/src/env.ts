import { createEnv } from '@t3-oss/env-core';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Selects the agent config file through validated environment settings. An absent
 * or empty override uses the local demo path; loadAgentConfig validates its contents.
 * Loading is lazy so startup can report failures without dumping configuration.
 */
export function loadCliEnv(runtimeEnv: NodeJS.ProcessEnv = process.env) {
  return createEnv({
    server: {
      FEATHERLANE_AGENT_CONFIG: z
        .string()
        .refine((value) => value.trim().length > 0 && !value.includes('\0'), 'Invalid config path')
        .default(join(homedir(), '.local', 'share', 'featherlane-demo', 'agent.json')),
    },
    runtimeEnvStrict: {
      FEATHERLANE_AGENT_CONFIG: runtimeEnv.FEATHERLANE_AGENT_CONFIG,
    },
    emptyStringAsUndefined: true,
    onValidationError: () => {
      throw new Error('Invalid CLI environment configuration');
    },
  });
}
