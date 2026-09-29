import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';

const manifestContents: unknown = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const manifest = z
  .object({
    scripts: z.object({
      dev: z.string(),
      'db:migrate': z.string(),
      'dev:broker': z.string(),
    }),
  })
  .parse(manifestContents);

/*
 * Exercise the actual development command with shell stand-ins. No developer
 * database is opened, no generated client is changed, and no server is started.
 * The project development shell is POSIX; pnpm's && chain must stop on failure.
 */
it.each([
  {
    generationExitCode: 0,
    migrationExitCode: 0,
    expected: ['db:generate', 'db:migrate', 'servers'],
  },
  { generationExitCode: 7, migrationExitCode: 0, expected: ['db:generate'] },
  { generationExitCode: 0, migrationExitCode: 9, expected: ['db:generate', 'db:migrate'] },
])('prepares development startup in order: $expected', (scenario) => {
  const result = spawnSync(
    '/bin/sh',
    [
      '-c',
      `
        pnpm() {
          printf '%s\\n' "$1"
          case "$1" in
            db:generate) return ${scenario.generationExitCode} ;;
            db:migrate) return ${scenario.migrationExitCode} ;;
            *) return 99 ;;
          esac
        }
        concurrently() {
          printf '%s\\n' servers
        }
        ${manifest.scripts.dev}
      `,
    ],
    { encoding: 'utf8', timeout: 5000 },
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(scenario.generationExitCode || scenario.migrationExitCode);
  expect(result.stdout.trim().split('\n')).toEqual(scenario.expected);
});

it('uses deploy migrations without changing the direct broker entrypoint', () => {
  expect(manifest.scripts['db:migrate']).toBe('tsx scripts/database/Migrate.ts deploy');
  expect(manifest.scripts['dev:broker']).toBe('tsx watch apps/broker/src/Main.ts');
  expect(manifest.scripts.dev).toContain('"pnpm dev:broker" "pnpm dev:console"');
});
