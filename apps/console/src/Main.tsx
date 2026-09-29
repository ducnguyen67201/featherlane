import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { AccessRequestsPage } from './features/access-requests/AccessRequestsPage.js';
import { consoleTheme } from './Theme.js';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Console root element is missing');
}

createRoot(rootElement).render(
  <StrictMode>
    <MantineProvider theme={consoleTheme} forceColorScheme="light">
      <AccessRequestsPage />
    </MantineProvider>
  </StrictMode>,
);
