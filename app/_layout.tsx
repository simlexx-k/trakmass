import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { initializeDatabase } from '@/services/storage';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/hooks/use-auth';

export const unstable_settings = {
  anchor: '(tabs)',
};

const LayoutInner = () => {
  const colorScheme = useColorScheme();
  const { accessToken } = useAuth();
  useOfflineSync(undefined, () => accessToken);

  useEffect(() => {
    initializeDatabase().catch((error) => {
      console.error('Failed to initialize local database', error);
    });
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <LayoutInner />
    </AuthProvider>
  );
}
