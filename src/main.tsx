import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EntryPage, entryPageReady } from './EntryPage';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

void entryPageReady.finally(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <EntryPage />
    </StrictMode>
  );
});
