import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '../types';
import { api } from './api';

type AuthContextValue = {
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.auth.me()
      .then((user) => {
        if (active) setProfile(user);
      })
      .catch(() => {
        if (active) setProfile(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const value: AuthContextValue = {
    profile,
    loading,
    async signIn(email, password) {
      await api.auth.signin(email, password);
      const user = await api.auth.me();
      setProfile(user);
    },
    async signUp(email, password) {
      await api.auth.signup(email, password);
      const user = await api.auth.me();
      setProfile(user);
    },
    async signOut() {
      await api.auth.signout();
      setProfile(null);
    },
    async refreshProfile() {
      setProfile(await api.auth.me());
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
