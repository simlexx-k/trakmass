import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';

const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? '';
const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ?? '';
const AUTH0_AUDIENCE = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE ?? '';
const TOKEN_KEY = 'trakmass.auth.token';

const isConfigured = Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID && AUTH0_AUDIENCE);

type AuthContextValue = {
  accessToken: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const createFallbackValue = (): AuthContextValue => ({
  accessToken: null,
  login: async () => {
    throw new Error('Auth0 is not configured.');
  },
  logout: async () => undefined,
  isAuthenticated: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  if (!isConfigured) {
    return <AuthContext.Provider value={createFallbackValue()}>{children}</AuthContext.Provider>;
  }

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'trakmass',
    useProxy: true,
  });
  const discovery = AuthSession.useAutoDiscovery(`https://${AUTH0_DOMAIN}`);
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: AUTH0_CLIENT_ID,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
      extraParams: { audience: AUTH0_AUDIENCE },
    },
    discovery,
  );
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const loadToken = async () => {
      const stored = await SecureStore.getItemAsync(TOKEN_KEY);
      if (stored) {
        setAccessToken(stored);
      }
    };
    loadToken();
  }, []);

  useEffect(() => {
    if (response?.type !== 'success' || !request || !discovery?.token_endpoint) {
      return;
    }
    (async () => {
      try {
        const tokenResponse = await AuthSession.exchangeCodeAsync(
          {
            clientId: AUTH0_CLIENT_ID,
            code: response.params.code,
            redirectUri,
            extraParams: {
              code_verifier: request.codeVerifier,
              audience: AUTH0_AUDIENCE,
            },
          },
          discovery,
        );
        if (tokenResponse.access_token) {
          await SecureStore.setItemAsync(TOKEN_KEY, tokenResponse.access_token);
          setAccessToken(tokenResponse.access_token);
        }
      } catch {
        // ignore, login will fail silently
      }
    })();
  }, [response, request, discovery, redirectUri]);

  const login = useCallback(async () => {
    if (!request) {
      throw new Error('Auth request is not ready');
    }
    await promptAsync({ useProxy: true });
  }, [promptAsync, request]);

  const logout = useCallback(async () => {
    setAccessToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, []);

  const value = useMemo(
    () => ({
      accessToken,
      login,
      logout,
      isAuthenticated: Boolean(accessToken),
    }),
    [accessToken, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
