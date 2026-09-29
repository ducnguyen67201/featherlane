import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { violations } from './CheckBoundaries.mjs';
import { verifyConsoleStates } from './ConsoleIntegration.mjs';

const exec = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), 'featherlane-e2e-'));
let broker;
let browser;
let mcp;
const owner = randomBytes(32).toString('hex');
const agent = randomBytes(32).toString('hex');

try {
  assert.ok(violations('apps/broker/src/domain/bad.ts', 'import fs from "node:fs"').length);
  assert.ok(violations('apps/broker/src/application/Bad.ts', 'import x from "./Server.js"').length);

  assert.ok(
    violations(
      'packages/client/src/bad.ts',
      'import x from "../../../../featherlane-cloud/private"',
    ).length,
  );

  assert.equal(
    violations(
      'apps/broker/src/domain/good.ts',
      'import type { Access } from "@featherlane/contracts"',
    ).length,
    0,
  );

  const setupDir = join(dir, 'setup');

  await exec(process.execPath, ['--import', 'tsx', 'scripts/Setup.ts'], {
    env: { ...process.env, FEATHERLANE_DEMO_DIR: setupDir },
  });

  const before = await readFile(join(setupDir, 'broker.json'), 'utf8');

  await assert.rejects(
    exec(process.execPath, ['--import', 'tsx', 'scripts/Setup.ts'], {
      env: { ...process.env, FEATHERLANE_DEMO_DIR: setupDir },
    }),
  );

  assert.equal(await readFile(join(setupDir, 'broker.json'), 'utf8'), before);
  assert.equal((await stat(join(setupDir, 'owner-token.txt'))).mode & 0o777, 0o600);
  const listener = createServer();

  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;

  await new Promise((resolve) => listener.close(resolve));
  const baseUrl = 'http://127.0.0.1:' + port;
  const configPath = join(dir, 'broker.json');
  const agentPath = join(dir, 'agent.json');

  await writeFile(
    configPath,
    JSON.stringify({
      port,
      databasePath: join(dir, 'db.sqlite'),
      ownerToken: owner,
      agents: [{ id: 'test-agent', token: agent }],
    }),
    { mode: 0o600 },
  );

  await writeFile(agentPath, JSON.stringify({ baseUrl, token: agent }), { mode: 0o600 });

  await exec(process.execPath, ['--import', 'tsx', 'scripts/database/Migrate.ts', 'deploy'], {
    env: { ...process.env, FEATHERLANE_DATABASE_PATH: join(dir, 'db.sqlite') },
  });

  broker = spawn(process.execPath, ['apps/broker/dist/Main.js'], {
    env: { ...process.env, FEATHERLANE_BROKER_CONFIG: configPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';

  broker.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  let ready = false;

  for (let attempt = 0; attempt < 100; attempt++) {
    if (broker.exitCode !== null) {
      throw new Error('Broker startup failed: ' + stderr);
    }

    try {
      if ((await fetch(baseUrl + '/health')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* retry bounded startup */
    }

    await delay(100);
  }

  assert.ok(ready, 'Broker did not start');

  const cli = async (args) =>
    JSON.parse(
      (
        await exec(process.execPath, ['apps/cli/dist/Main.js', ...args], {
          env: { ...process.env, FEATHERLANE_AGENT_CONFIG: agentPath },
        })
      ).stdout,
    );

  assert.equal((await cli(['connections'])).length, 3);
  const grant = await cli(['request', '--connection', 'staging', '--purpose', 'fixture']);

  assert.equal(grant.status, 'granted');
  assert.equal((await cli(['release', grant.id])).status, 'revoked');

  const pending = await cli([
    'request',
    '--connection',
    'production',
    '--purpose',
    'browser fixture approval',
  ]);

  assert.equal(pending.status, 'pending');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(baseUrl);
  await page.getByLabel('Owner token').fill(owner);
  await page.getByRole('button', { name: 'Load requests' }).click();
  await page.getByRole('button', { name: 'Approve once' }).click();
  await page.getByRole('button', { name: 'Revoke grant' }).waitFor();
  assert.equal((await cli(['status', pending.id])).status, 'granted');
  await page.getByRole('button', { name: 'Revoke grant' }).click();

  await page.waitForFunction(
    () => !document.querySelector('main')?.textContent?.includes('Revoke grant'),
  );

  assert.equal((await cli(['status', pending.id])).status, 'revoked');
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  await page.getByRole('button', { name: 'Lock console' }).click();
  assert.equal(await page.getByLabel('Owner token').inputValue(), '');
  await verifyConsoleStates(page, baseUrl, owner, cli);
  assert.deepEqual(pageErrors, []);
  mcp = new Client({ name: 'foundation-test', version: '1.0.0' });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('apps/cli/dist/Main.js'), 'mcp'],
    env: { PATH: process.env.PATH ?? '', FEATHERLANE_AGENT_CONFIG: agentPath },
    stderr: 'pipe',
  });

  await mcp.connect(transport);
  const list = await mcp.listTools();

  assert.deepEqual(list.tools.map((tool) => tool.name).sort(), [
    'access_status',
    'list_connections',
    'release_access',
    'request_access',
  ]);

  const result = await mcp.callTool({
    name: 'request_access',
    arguments: {
      connectionId: 'personal',
      purpose: 'fixture',
      ttlSeconds: 30,
      idempotencyKey: randomUUID(),
    },
  });

  const denied = JSON.parse(result.content[0].text);

  assert.equal(denied.status, 'denied');
  const status = await mcp.callTool({ name: 'access_status', arguments: { id: denied.id } });

  assert.equal(JSON.parse(status.content[0].text).status, 'denied');
  assert.ok(!JSON.stringify(list).includes(owner));
  assert.ok(!stderr.includes(owner));
  assert.ok(!stderr.includes(agent));

  console.log(
    'PASS: setup safety, architecture negatives, built broker/CLI, browser owner approval/revocation, MCP stdio and denied access',
  );
} finally {
  await mcp?.close();
  await browser?.close();

  if (broker && broker.exitCode === null) {
    broker.kill('SIGTERM');
    await new Promise((resolve) => broker.once('exit', resolve));
  }

  await rm(dir, { recursive: true, force: true });
}
