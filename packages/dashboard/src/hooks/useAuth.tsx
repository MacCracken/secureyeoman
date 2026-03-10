import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  login as apiLogin,
  logout as apiLogout,
  setAuthTokens,
  getAccessToken,
  setOnAuthFailure,
  verifySession,
} from '../api/client';

interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const handleAuthFailure = useCallback(() => {
    setToken(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    setOnAuthFailure(handleAuthFailure);
  }, [handleAuthFailure]);

  useEffect(() => {
    // Verify existing token with the server on mount.
    // If the DB was wiped or the signing secret changed, this clears stale tokens.
    const existing = getAccessToken();
    if (!existing) {
      setIsLoading(false);
      return;
    }
    verifySession().then((valid) => {
      setToken(valid ? getAccessToken() : null);
      setIsLoading(false);
    });
  }, []);

  const login = useCallback(async (password: string, rememberMe?: boolean) => {
    const result = await apiLogin(password, rememberMe);
    setAuthTokens(result.accessToken, result.refreshToken);
    setToken(result.accessToken);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setToken(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <AuthContext.Provider
      value={{
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
