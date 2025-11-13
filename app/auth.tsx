import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/hooks/use-auth';

const buildQuery = (params: Record<string, string | string[] | undefined>) =>
  Object.entries(params)
    .map(([key, value]) => {
      if (value == null) return null;
      const stringValue = Array.isArray(value) ? value[0] : value;
      return `${encodeURIComponent(key)}=${encodeURIComponent(stringValue)}`;
    })
    .filter(Boolean)
    .join('&');

export default function AuthRedirectScreen() {
  const { handleDeepLink } = useAuth();
  const params = useLocalSearchParams();
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const query = buildQuery(params);
      const url = query ? `trakmass://auth?${query}` : 'trakmass://auth';
      await handleDeepLink(url);
      router.replace('/(tabs)');
    };
    run();
  }, [handleDeepLink, params, router]);

  return null;
}
