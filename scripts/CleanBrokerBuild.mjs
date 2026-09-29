import { rmSync } from 'node:fs';

/*
 * TypeScript emits current files but does not remove outputs for deleted source
 * files. Clean only the broker's generated output before compiling so retired
 * implementations and their declarations cannot remain in the built package.
 * Resolve from this script, not the terminal directory; accept no user paths.
 */
const brokerBuildDirectory = new URL('../apps/broker/dist/', import.meta.url);

rmSync(brokerBuildDirectory, { recursive: true, force: true });
