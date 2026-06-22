import { AuthProvider, useAuth } from './lib/auth';
import AuthScreen from './views/AuthScreen';
import Shell from './views/Shell';

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

function Root() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      </div>
    );
  }

  if (!session || !profile) return <AuthScreen />;
  return <Shell />;
}
