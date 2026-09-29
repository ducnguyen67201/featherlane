import { createEnv } from '@t3-oss/env-core';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Validates the broker's environment at startup, not module import time, so failures
 * reach startup error handling. Tests can supply an isolated environment object.
 * This selects the JSON config path; it does not load a .env file or parse that JSON.
 */
export function loadBrokerEnv(runtimeEnv: NodeJS.ProcessEnv = process.env) {
  return createEnv({
    server: {
      FEATHERLANE_BROKER_CONFIG: z
        .string()
        .refine((value) => value.trim().length > 0 && !value.includes('\0'), 'Invalid config path')
        .default(join(homedir(), '.local', 'share', 'featherlane-demo', 'broker.json')),
    },
    runtimeEnvStrict: {
      FEATHERLANE_BROKER_CONFIG: runtimeEnv.FEATHERLANE_BROKER_CONFIG,
    },
    emptyStringAsUndefined: true,
    onValidationError: () => {
      throw new Error('Invalid broker environment configuration');
    },
  });
}
