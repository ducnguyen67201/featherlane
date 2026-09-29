import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

export function violations(path, content) {
  const errors = [];
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);

  const visit = (node) => {
    let target;

    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      target = node.moduleSpecifier.text;
    }

    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      if (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0])) {
        errors.push(path + ': nonliteral import');
      } else {
        target = node.arguments[0].text;
      }
    }

    if (target) {
      if (
        target.includes('featherlane-cloud') ||
        target.includes('@featherlane-cloud') ||
        target.includes('/Users/')
      ) {
        errors.push(path + ': private or absolute dependency');
      }

      if (
        path.includes('/domain/') &&
        !['@featherlane/contracts', '@featherlane/contracts/access-values'].includes(target) &&
        !target.startsWith('./')
      ) {
        errors.push(path + ': domain imports I/O or another layer');
      }

      if (path.startsWith('packages/') && target.includes('apps/')) {
        errors.push(path + ': package imports application');
      }

      if (
        path.includes('/application/') &&
        /infrastructure|server|fastify|sqlite|prisma|generated/.test(target)
      ) {
        errors.push(path + ': application imports adapter');
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return errors;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', 'generated'].includes(entry.name)) {
      return [];
    }

    const path = join(dir, entry.name);

    return entry.isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

const errors = ['apps', 'packages']
  .flatMap(walk)
  .flatMap((path) => violations(relative('.', path), readFileSync(path, 'utf8')));

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Architecture boundaries passed');
}
