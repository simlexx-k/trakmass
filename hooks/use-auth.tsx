import * as WebBrowser from 'expo-web-browser';
import { AppState, Platform, Linking as RNLinking } from 'react-native';
import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'trakmass.session.token';
const USER_KEY = 'trakmass.session.user';
const EXPO_SYNC_ENDPOINT = process.env.EXPO_PUBLIC_SYNC_ENDPOINT ?? 'http://localhost:8009/v1/mass';
const BACKEND_BASE_URL = EXPO_SYNC_ENDPOINT.replace(/\/v1\/mass\/?$/, '');
const LOGIN_URL = `${BACKEND_BASE_URL}/auth/login`;
const ME_URL = `${BACKEND_BASE_URL}/auth/me`;
const REDIRECT_URI = 'trakmass://auth';
const USER_REFRESH_INTERVAL = 25 * 60 * 1000;

const resolveRedirectUri = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return REDIRECT_URI;
};

type UserInfo = {
  sub: string;
  name?: string;
  email?: string;
};

type AuthContextValue = {
  accessToken: string | null;
  user: UserInfo | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  handleDeepLink: (url: string | null) => Promise<void>;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

let secureStoreAvailable: boolean | null = null;
const checkSecureStore = async () => {
  if (secureStoreAvailable !== null) {
    return secureStoreAvailable;
  }
  try {
    secureStoreAvailable = await SecureStore.isAvailableAsync();
  } catch {
    secureStoreAvailable = false;
  }
  return secureStoreAvailable;
};

let fallbackToken: string | null = null;
const readToken = async (): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return window?.localStorage.getItem(TOKEN_KEY) ?? null;
  }
  if (await checkSecureStore()) {
    return SecureStore.getItemAsync(TOKEN_KEY);
  }
  return fallbackToken;
};

const writeToken = async (token: string | null) => {
  if (Platform.OS === 'web') {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  if (await checkSecureStore()) {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
    return;
  }
  fallbackToken = token;
};

const fetchProfile = async (token: string): Promise<UserInfo | null> => {
  const resp = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 401) {
    throw new Error('Unauthorized');
  }
  if (!resp.ok) return null;
  return resp.json();
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);

  const clearStoredUser = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.removeItem(USER_KEY);
    }
  }, []);

  const invalidateSession = useCallback(async () => {
    await writeToken(null);
    setAccessToken(null);
    setUser(null);
    clearStoredUser();
  }, [clearStoredUser]);

  const updateUser = useCallback(async (token: string | null) => {
    if (!token) {
      await invalidateSession();
      return;
    }
    try {
      const profile = await fetchProfile(token);
      if (!profile) {
        return;
      }
      setUser(profile);
      if (Platform.OS === 'web') {
        window.localStorage.setItem(USER_KEY, JSON.stringify(profile));
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Unauthorized') {
        await invalidateSession();
      }
    }
  }, [invalidateSession]);

  const handleDeepLink = useCallback(
    async (url: string | null) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      const token = parsed.queryParams?.session_token;
      if (token) {
        await writeToken(token);
        setAccessToken(token);
        await updateUser(token);
      }
    },
    [updateUser],
  );

  useEffect(() => {
    const init = async () => {
      const stored = await readToken();
      if (stored) {
        setAccessToken(stored);
        await updateUser(stored);
      }
      const initialUrl = await RNLinking.getInitialURL();
      await handleDeepLink(initialUrl);
    };
    init();
    const subscription = RNLinking.addEventListener('url', (event) => handleDeepLink(event.url));
    return () => subscription.remove();
  }, [handleDeepLink, updateUser]);

  const login = useCallback(async () => {
    await WebBrowser.openBrowserAsync(
      `${LOGIN_URL}?redirect=${encodeURIComponent(resolveRedirectUri())}`,
    );
  }, []);

  const logout = useCallback(async () => {
    await invalidateSession();
  }, [invalidateSession]);

  const refreshUser = useCallback(async () => {
    if (accessToken) {
      await updateUser(accessToken);
    }
  }, [accessToken, updateUser]);

  useEffect(() => {
    if (!accessToken) return;
    const intervalId = setInterval(() => {
      refreshUser().catch(() => undefined);
    }, USER_REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [accessToken, refreshUser]);

  useEffect(() => {
    const handleAppState = (nextState: string) => {
      if (nextState === 'active') {
        refreshUser().catch(() => undefined);
      }
    };
    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [refreshUser]);

  const value = useMemo(
    () => ({
      accessToken,
      user,
      login,
      logout,
      refreshUser,
      handleDeepLink,
      isAuthenticated: Boolean(accessToken),
    }),
    [accessToken, user, login, logout, refreshUser, handleDeepLink],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
