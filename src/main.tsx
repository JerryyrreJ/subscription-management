import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EntryPage } from './EntryPage';
import './i18n';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
 <StrictMode>
 <EntryPage />
 </StrictMode>
);
