import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const ignoredDirectories = new Set(['node_modules', 'dist', 'generated']);
const toolingExceptions = new Set(['vite.config.ts', 'vite-env.d.ts']);

/** Inspect source files, not build output or immutable database fixtures. */
function listOwnedFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : listOwnedFiles(path);
    }

    return /\.(ts|tsx|mjs|md)$/.test(entry.name) ? [path] : [];
  });
}

const ownedFiles = ['apps', 'packages', 'scripts', 'tests', 'docs'].flatMap((directory) =>
  listOwnedFiles(join(repositoryRoot, directory)),
);

it('uses PascalCase for owned filenames, with explicit tooling exceptions', () => {
  const invalidNames = ownedFiles
    .filter((file) => !toolingExceptions.has(basename(file)))
    .filter((file) => !/^[A-Z][A-Za-z0-9]*(?:\.[a-z]+)*$/.test(basename(file)))
    .map((file) => relative(repositoryRoot, file));

  expect(invalidNames).toEqual([]);
});

it('spells relative source imports exactly, including on case-insensitive hosts', () => {
  const mismatches: string[] = [];

  for (const file of ownedFiles.filter((path) => /\.(ts|tsx|mjs)$/.test(path))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );

    for (const statement of source.statements) {
      if (
        (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) ||
        !statement.moduleSpecifier ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !statement.moduleSpecifier.text.startsWith('.')
      ) {
        continue;
      }

      const importPath = statement.moduleSpecifier.text;
      const target = resolve(dirname(file), importPath);

      /* Built entrypoints are checked by integration after compilation. */
      if (relative(repositoryRoot, target).split('/').includes('dist')) {
        continue;
      }

      const candidates = target.endsWith('.js')
        ? [target.slice(0, -3) + '.ts', target.slice(0, -3) + '.tsx', target]
        : [target];

      const sourceTarget = candidates.find((candidate) => existsSync(candidate));

      if (!sourceTarget) {
        mismatches.push(relative(repositoryRoot, file) + ': missing ' + importPath);
        continue;
      }

      let parent = repositoryRoot;

      for (const segment of relative(repositoryRoot, sourceTarget).split('/')) {
        if (!readdirSync(parent).includes(segment)) {
          mismatches.push(relative(repositoryRoot, file) + ': wrong case ' + importPath);
          break;
        }

        parent = join(parent, segment);
      }
    }
  }

  expect(mismatches).toEqual([]);
});
