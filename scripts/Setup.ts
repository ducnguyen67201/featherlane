import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { loadSetupEnv } from './Env.js';

const dir = resolve(loadSetupEnv().FEATHERLANE_DEMO_DIR);

mkdirSync(dir, { recursive: true, mode: 0o700 });
const files = ['broker.json', 'agent.json', 'owner-token.txt'];

if (files.some((file) => existsSync(join(dir, file)))) {
  console.error('Setup refused to overwrite existing config in ' + dir);
  process.exitCode = 1;
} else {
  const ownerToken = randomBytes(32).toString('hex');
  const agentToken = randomBytes(32).toString('hex');

  /*
   * Exclusive creation prevents overwrites even if a file appears after the check
   * above. Owner-only file modes do not isolate credentials from same-user agents;
   * keep the owner token out of agent configuration and treat this as a local demo.
   */
  const write = (name: string, value: string) =>
    writeFileSync(join(dir, name), value + '\n', { mode: 0o600, flag: 'wx' });

  write(
    'broker.json',
    JSON.stringify(
      {
        port: 4318,
        databasePath: join(dir, 'demo.sqlite'),
        ownerToken,
        agents: [{ id: 'demo-agent', token: agentToken }],
      },
      null,
      2,
    ),
  );

  write(
    'agent.json',
    JSON.stringify({ baseUrl: 'http://127.0.0.1:4318', token: agentToken }, null, 2),
  );

  write('owner-token.txt', ownerToken);
  console.log('Synthetic development configuration created in ' + dir);

  console.log(
    'Owner token is in owner-token.txt; enter it only in the owner console. Never pass it to an agent.',
  );

  console.log('This same-user demo is not a credential-isolation boundary.');
}
