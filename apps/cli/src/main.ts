#!/usr/bin/env node
import { FeatherlaneClient } from '@featherlane/client';
import { loadAgentConfig } from './config.js';
import { createCli } from './commands.js';
import { runMcp } from './mcp.js';

try {
  const config = loadAgentConfig();

  const client = new FeatherlaneClient(config);

  if (process.argv[2] === 'mcp') {
    await runMcp(client);
  } else {
    await createCli(client, (value) => console.log(JSON.stringify(value, null, 2))).parseAsync();
  }
} catch {
  console.error(
    'Featherlane command failed. Check agent config, broker availability, and arguments. No credentials were logged.',
  );

  process.exitCode = 1;
}
