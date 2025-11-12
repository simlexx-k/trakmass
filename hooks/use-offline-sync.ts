import { useEffect, useRef } from 'react';
import * as Network from 'expo-network';

import { syncPendingEntries } from '@/services/sync';

type Options = {
  enabled?: boolean;
  intervalMs?: number;
};

const defaultOptions: Required<Options> = {
  enabled: true,
  intervalMs: 2 * 60 * 1000,
};

export const useOfflineSync = (options?: Options) => {
  const settings = { ...defaultOptions, ...options };
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!settings.enabled) return () => undefined;

    let isMounted = true;
    let subscription: Network.NetworkStateSubscription | null = null;

    const runSync = async () => {
      try {
        await syncPendingEntries();
      } catch (error) {
        // eslint-disable-next-line no-console -- logging best-effort sync status
        console.warn('Offline sync failed', error);
      }
    };

    const setup = async () => {
      await runSync();
      subscription = Network.addNetworkStateListener((state) => {
        if (!isMounted) return;
        if (state.isConnected && state.isInternetReachable) {
          runSync();
        }
      });

      timerRef.current = setInterval(runSync, settings.intervalMs);
    };

    setup();

    return () => {
      isMounted = false;
      subscription?.remove();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [settings.enabled, settings.intervalMs]);
};
