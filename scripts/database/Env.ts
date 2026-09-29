import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

/** Explicit database override for migration tooling and isolated test databases. */
export function loadDatabaseEnv(runtimeEnv: NodeJS.ProcessEnv = process.env) {
  return createEnv({
    server: {
      FEATHERLANE_DATABASE_PATH: z
        .string()
        .refine(
          (value) => value.trim().length > 0 && !value.includes('\0') && value !== ':memory:',
          'A SQLite file path is required',
        )
        .optional(),
    },
    runtimeEnvStrict: { FEATHERLANE_DATABASE_PATH: runtimeEnv.FEATHERLANE_DATABASE_PATH },
    emptyStringAsUndefined: true,
    onValidationError: () => {
      throw new Error('Invalid database tooling configuration');
    },
  });
}
