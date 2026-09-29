import { createEnv } from '@t3-oss/env-core';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Owns the setup script's output-directory setting. Application processes have
 * separate env modules so they do not inherit setup-only configuration concerns.
 */
export function loadSetupEnv(runtimeEnv: NodeJS.ProcessEnv = process.env) {
  return createEnv({
    server: {
      FEATHERLANE_DEMO_DIR: z
        .string()
        .refine(
          (value) => value.trim().length > 0 && !value.includes('\0'),
          'Invalid demo directory',
        )
        .default(join(homedir(), '.local', 'share', 'featherlane-demo')),
    },
    runtimeEnvStrict: {
      FEATHERLANE_DEMO_DIR: runtimeEnv.FEATHERLANE_DEMO_DIR,
    },
    emptyStringAsUndefined: true,
    onValidationError: () => {
      throw new Error('Invalid setup environment configuration');
    },
  });
}
