import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type AdminUser = {
  name: string;
  email: string;
  role: 'ADMIN';
};

type AuthValue = {
  user: AdminUser | null;
  signIn: (email: string, password: string) => Promise<AdminUser>;
  signOut: () => void;
};

const STORAGE_KEY = 'ss-admin-user';
const AuthContext = createContext<AuthValue | null>(null);

function read(): AdminUser | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(read);

  const signIn = useCallback(async (email: string, _password: string) => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const local = email.split('@')[0] ?? 'admin';
    const next: AdminUser = {
      name: local
        .split(/[._-]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      email,
      role: 'ADMIN',
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage can be unavailable */
    }
    setUser(next);
    return next;
  }, []);

  const signOut = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage can be unavailable */
    }
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
