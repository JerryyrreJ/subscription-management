import { App } from './App';
import { AuthProvider } from './contexts/AuthContext';
import './i18n';

export default function Application() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
