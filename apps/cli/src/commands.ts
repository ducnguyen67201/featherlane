import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import type { FeatherlaneClient } from '@featherlane/client';

export function createCli(client: FeatherlaneClient, write: (value: unknown) => void): Command {
  const program = new Command()
    .name('featherlane')
    .description('Synthetic agent access demo — not real browser authentication')
    .version('0.1.0');

  program.command('connections').action(async () => write(await client.connections()));

  program
    .command('request')
    .requiredOption('--connection <id>')
    .requiredOption('--purpose <text>')
    .option('--ttl <seconds>', '30–900 seconds', '300')
    .option('--key <uuid>', 'Reuse only for the same request')
    .action(async (options: { connection: string; purpose: string; ttl: string; key?: string }) =>
      write(
        await client.requestAccess({
          connectionId: options.connection,
          purpose: options.purpose,
          ttlSeconds: Number(options.ttl),
          idempotencyKey: options.key ?? randomUUID(),
        }),
      ),
    );

  program.command('status <id>').action(async (id: string) => write(await client.getAccess(id)));

  program
    .command('release <id>')
    .action(async (id: string) => write(await client.releaseAccess(id)));

  return program;
}
