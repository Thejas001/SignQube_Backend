/** Session context: who is signed in, and the role gate for each area. */

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { api, setAccessToken, setUnauthenticatedHandler } from './api';
import { ROLE_HOME } from './format';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthenticatedHandler(clear);
  }, [clear]);

  // On a reload the access token is gone but the refresh cookie may still be
  // good, so try once to pick the session back up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.refreshSession();
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (credentials) => {
      const data = await api.post('/auth/login', credentials);
      setAccessToken(data.accessToken);
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const register = useCallback(async (payload) => {
    const data = await api.post('/auth/register', payload);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // Signing out locally matters more than the server round trip.
    }
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Gate an area by role. The signed-in user's role decides what they can open. */
export function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-ink-faint">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    // Signed in, wrong area: send them to their own.
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />;
  }

  return children;
}
