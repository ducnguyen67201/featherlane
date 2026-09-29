import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('removes stale broker build output without touching source or other packages', () => {
  const directory = mkdtempSync(join(tmpdir(), 'featherlane-build-cleanup-'));
  const script = join(directory, 'scripts', 'CleanBrokerBuild.mjs');
  const output = join(directory, 'apps', 'broker', 'dist');
  const source = join(directory, 'apps', 'broker', 'src', 'current.ts');
  const otherOutput = join(directory, 'apps', 'cli', 'dist', 'Main.js');

  try {
    mkdirSync(join(directory, 'scripts'), { recursive: true });
    mkdirSync(join(output, 'infrastructure'), { recursive: true });
    mkdirSync(join(directory, 'apps', 'broker', 'src'), { recursive: true });
    mkdirSync(join(directory, 'apps', 'cli', 'dist'), { recursive: true });
    copyFileSync(new URL('../scripts/CleanBrokerBuild.mjs', import.meta.url), script);
    writeFileSync(source, 'source must remain');
    writeFileSync(otherOutput, 'other package must remain');

    for (const extension of ['js', 'd.ts', 'js.map']) {
      writeFileSync(join(output, 'infrastructure', 'retired-store.' + extension), 'stale output');
    }

    // Deliberately run outside the fixture repository; cleanup must use the script location.
    execFileSync(process.execPath, [script], { cwd: tmpdir() });
    execFileSync(process.execPath, [script], { cwd: tmpdir() });

    expect(existsSync(output)).toBe(false);
    expect(readFileSync(source, 'utf8')).toBe('source must remain');
    expect(readFileSync(otherOutput, 'utf8')).toBe('other package must remain');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
