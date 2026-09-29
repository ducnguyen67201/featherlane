import { createTheme } from '@mantine/core';

/** Keep branding here; use upstream Mantine components without local UI wrappers. */
export const consoleTheme = createTheme({
  primaryColor: 'teal',
  primaryShade: 8,
  defaultRadius: 'md',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  headings: { fontFamily: 'inherit' },
});
