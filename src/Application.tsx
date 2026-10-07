import { App } from './App';
import { AuthProvider } from './contexts/AuthContext';

export default function Application() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
