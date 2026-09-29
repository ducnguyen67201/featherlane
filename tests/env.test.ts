import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCliEnv } from '../apps/cli/src/env.js';
import { loadBrokerEnv } from '../apps/broker/src/env.js';
import { loadSetupEnv } from '../scripts/env.js';
import { loadAgentConfig } from '../apps/cli/src/config.js';

const defaultDirectory = join(homedir(), '.local', 'share', 'featherlane-demo');

const readers = [
  {
    name: 'CLI',
    key: 'FEATHERLANE_AGENT_CONFIG',
    fallback: join(defaultDirectory, 'agent.json'),
    read: (env: NodeJS.ProcessEnv) => loadCliEnv(env).FEATHERLANE_AGENT_CONFIG,
  },
  {
    name: 'broker',
    key: 'FEATHERLANE_BROKER_CONFIG',
    fallback: join(defaultDirectory, 'broker.json'),
    read: (env: NodeJS.ProcessEnv) => loadBrokerEnv(env).FEATHERLANE_BROKER_CONFIG,
  },
  {
    name: 'setup',
    key: 'FEATHERLANE_DEMO_DIR',
    fallback: defaultDirectory,
    read: (env: NodeJS.ProcessEnv) => loadSetupEnv(env).FEATHERLANE_DEMO_DIR,
  },
];

describe.each(readers)('$name environment', ({ key, read, fallback }) => {
  it('defaults missing/empty values without changing the caller environment', () => {
    const input = { [key]: '' };

    expect(read({})).toBe(fallback);
    expect(read(input)).toBe(fallback);
    expect(input[key]).toBe('');
  });

  it('accepts a configured path including spaces', () => {
    expect(read({ [key]: '/tmp/Featherlane demo/config.json' })).toBe(
      '/tmp/Featherlane demo/config.json',
    );
  });

  it('rejects whitespace and NUL paths without logging values', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(() => read({ [key]: '   ' })).toThrow('environment configuration');
      expect(() => read({ [key]: 'private-value\0' })).toThrow('environment configuration');
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

it('loads agent JSON using an explicit path and returns sanitized errors for bad files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'featherlane-config-test-'));
  const path = join(directory, 'agent.json');
  const config = { baseUrl: 'http://127.0.0.1:4318', token: 'a'.repeat(40) };

  try {
    expect(() => loadAgentConfig(path)).toThrow('Could not load agent configuration');
    writeFileSync(path, JSON.stringify(config), { mode: 0o600 });
    expect(loadAgentConfig(path)).toEqual(config);

    for (const contents of [
      'invalid-json-private-value',
      JSON.stringify({ ...config, ownerToken: 'private-value' }),
      JSON.stringify({ baseUrl: 'invalid', token: 'private-value' }),
    ]) {
      writeFileSync(path, contents);
      expect(() => loadAgentConfig(path)).toThrow('Could not load agent configuration');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
