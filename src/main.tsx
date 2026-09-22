import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { E2EEGate } from './components/E2EEGate';
import { AuthProvider } from './contexts/AuthContext';
import './i18n';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
 <StrictMode>
 <AuthProvider>
 <E2EEGate />
 </AuthProvider>
 </StrictMode>
);
