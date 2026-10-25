import React, { createContext, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "../lib/api";
import type { User } from "../types";

interface TokenOut {
  access_token: string;
  token_type: string;
  user: User;
  message?: string;
}

interface RegisterInitOut {
  requires_verification: boolean;
  email: string;
  message: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<RegisterInitOut>;
  verifyRegistration: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<{ message: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const token = tokenStore.get();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const current = await api<User>("/auth/me");
      setUser(current);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const accept = (res: TokenOut) => {
    tokenStore.set(res.access_token);
    setUser(res.user);
  };

  const login = async (email: string, password: string) => {
    const res = await api<TokenOut>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    accept(res);
  };

  const register = async (name: string, email: string, password: string): Promise<RegisterInitOut> => {
    const res = await api<RegisterInitOut & { access_token?: string; user?: User }>("/auth/register", {
      method: "POST",
      body: { name, email, password },
    });
    if (res.access_token && res.user) {
      accept({ access_token: res.access_token, token_type: "bearer", user: res.user });
    }
    return res;
  };

  const verifyRegistration = async (email: string, code: string) => {
    const res = await api<TokenOut>("/auth/verify-registration", {
      method: "POST",
      body: { email, code },
    });
    accept(res);
  };

  const resendVerification = async (email: string) => {
    return await api<{ message: string }>("/auth/resend-verification", {
      method: "POST",
      body: { email },
    });
  };

  const logout = () => {
    tokenStore.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        verifyRegistration,
        resendVerification,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
