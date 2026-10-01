import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setToken, clearToken, getToken } from '@/lib/api';

export type UserProfile = {
  bio?: string;
  current_country?: string;
  current_city?: string;
  current_state?: string;
  origin_city?: string;
  origin_state?: string;
  primary_skill?: string;
  interests?: string[];
  onboarding_completed?: boolean;
  cover_url?: string;
};

export type User = {
  id: string;
  email: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  is_admin?: boolean;
  is_premium?: boolean;
  is_verified?: boolean;
  email_verified?: boolean;
  terms_accepted?: boolean;
  onboarding_completed?: boolean;
  profile?: UserProfile;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    username: string;
    full_name: string;
    country?: string;
    terms_accepted: boolean;
  }) => Promise<{ email: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      const me = await api<User>('/auth/me');
      setUser(me);
    } catch {
      clearToken();
      setUser(null);
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    await refreshUser();
  };

  const register = async (data: {
    email: string;
    password: string;
    username: string;
    full_name: string;
    country?: string;
    terms_accepted: boolean;
  }) => {
    const res = await api<{ pending_verification: boolean; email: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { email: res.email };
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
