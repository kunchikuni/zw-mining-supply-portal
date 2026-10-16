'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { AuthUser } from './types';
import { SESSION_ENDED_EVENT } from './api';

// NOTE for production hardening: this MVP stores the JWT in localStorage for
// simplicity. That's readable by any script on the page (XSS risk). A
// production build should move to an httpOnly, Secure, SameSite cookie set
// by the backend, with a short-lived access token + refresh token pair.

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  setToken: (token: string | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function decodeToken(token: string): AuthUser | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('zwsp_token');
    if (stored) {
      setTokenState(stored);
      setUser(decodeToken(stored));
    }
  }, []);

  // The server refused our token (disabled account, password changed
  // elsewhere, expired): sign out here too.
  useEffect(() => {
    const signOut = () => {
      setTokenState(null);
      setUser(null);
      window.localStorage.removeItem('zwsp_token');
    };
    window.addEventListener(SESSION_ENDED_EVENT, signOut);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, signOut);
  }, []);

  function setToken(next: string | null) {
    setTokenState(next);
    setUser(next ? decodeToken(next) : null);
    if (next) {
      window.localStorage.setItem('zwsp_token', next);
    } else {
      window.localStorage.removeItem('zwsp_token');
    }
  }

  function logout() {
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
