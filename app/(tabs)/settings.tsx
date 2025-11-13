import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { syncPendingEntries, seedEntries } from '@/services/sync';
import { scheduleDailyReminder, cancelScheduledReminder } from '@/services/reminders';
import { useMassStore } from '@/store/useMassStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/use-auth';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const {
    settings,
    hydrate,
    isHydrated,
    update,
    setLastSync,
  } = useSettingsStore();
  const [reminderInput, setReminderInput] = useState(String(settings.reminderHour));
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const { entries } = useMassStore();
  const { login, logout, accessToken, isAuthenticated } = useAuth();
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    if (!isHydrated) {
      hydrate().catch(() => undefined);
    }
  }, [hydrate, isHydrated]);

  useEffect(() => {
    setReminderInput(String(settings.reminderHour));
  }, [settings.reminderHour]);

  const syncEndpoint = process.env.EXPO_PUBLIC_SYNC_ENDPOINT ?? 'Not configured';

  const handleSaveReminder = async () => {
    const hour = Number.parseInt(reminderInput, 10);
    if (Number.isNaN(hour) || hour < 0 || hour > 23) {
      Alert.alert('Invalid hour', 'Set a reminder hour between 0–23');
      return;
    }
    await update({ reminderHour: hour });
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      if (!accessToken) {
        await login();
        setSyncMessage('Please log in to sync.');
        return;
      }
      const stats = await syncPendingEntries(accessToken ?? undefined);
      if (stats.skipped) {
        setSyncMessage(`Sync skipped: ${stats.reason ?? 'feature disabled'}`);
      } else {
        setSyncMessage(`Synced ${stats.synced}/${stats.attempted} changes`);
        await setLastSync(new Date().toISOString());
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setSyncMessage(`Sync failed: ${message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAuthAction = async () => {
    setSyncMessage(null);
    try {
      if (isAuthenticated) {
        await logout();
      } else {
        await login();
      }
      setSeedMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      setSyncMessage(message);
    }
  };

  const handleManualSeed = async () => {
    if (!accessToken) {
      Alert.alert('Sign in required', 'Please log in with Auth0 before syncing.');
      return;
    }
    setIsSeeding(true);
    setSeedMessage(null);
    try {
      await seedEntries(entries, accessToken);
      setSeedMessage('Remote entries seeded successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to seed entries';
      setSeedMessage(message);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleAutoSyncToggle = async (value: boolean) => {
    await update({ autoSync: value });
    if (value && accessToken) {
      await handleManualSeed();
    }
  };

  const lastSyncText = settings.lastSync
    ? new Date(settings.lastSync).toLocaleString()
    : 'Never';

  const reminderLabel = useMemo(
    () => `${settings.reminderHour}:00 local time`,
    [settings.reminderHour],
  );

  useEffect(() => {
    if (!isHydrated) return;
    const syncReminder = async () => {
      if (!settings.remindersEnabled) {
        await cancelScheduledReminder(settings.reminderNotificationId);
        if (settings.reminderNotificationId) {
          await update({ reminderNotificationId: null });
        }
        return;
      }
      const identifier = await scheduleDailyReminder(
        settings.reminderHour,
        settings.reminderNotificationId,
      );
      if (identifier && identifier !== settings.reminderNotificationId) {
        await update({ reminderNotificationId: identifier });
      }
    };
    syncReminder();
  }, [
    isHydrated,
    settings.reminderHour,
    settings.remindersEnabled,
    settings.reminderNotificationId,
    update,
  ]);

  return (
    <AppShell activeRoute="settings" title="Settings">
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: palette.background }]}>
          <Text style={[styles.heading, { color: palette.text }]}>Sync</Text>
          <View style={styles.authRow}>
            <Text style={[styles.label, { color: palette.icon }]}>
              {isAuthenticated ? 'Connected to Auth0' : 'Sign in with Auth0 to sync'}
            </Text>
            <Pressable style={styles.syncAction} onPress={handleAuthAction}>
              <Text style={styles.syncActionText}>
                {isAuthenticated ? 'Logout' : 'Login'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: palette.icon }]}>Auto sync</Text>
            <Switch
              value={settings.autoSync}
              onValueChange={(value) => handleAutoSyncToggle(value)}
              thumbColor={palette.background}
              trackColor={{ false: '#E5E7EB', true: palette.tint }}
            />
          </View>
          <Text style={[styles.detail, { color: palette.icon }]}>
            Endpoint: {syncEndpoint}
          </Text>
          <View style={[styles.row, styles.syncRow]}>
            <Text style={[styles.label, { color: palette.icon }]}>Manual sync</Text>
            <Pressable
              style={[styles.syncButton, { backgroundColor: palette.tint }]}
              onPress={handleSyncNow}
              disabled={!isAuthenticated || isSyncing}>
              <Text style={styles.syncButtonText}>
                {isSyncing ? 'Syncing…' : 'Sync Now'}
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.detail, { color: palette.icon }]}>
            Last sync: {lastSyncText}
          </Text>
          {syncMessage ? (
            <Text style={[styles.detail, { color: palette.tint }]}>{syncMessage}</Text>
          ) : null}
          <Pressable
            style={[styles.seedButton, { backgroundColor: palette.tint }]}
            onPress={handleManualSeed}
            disabled={!isAuthenticated || isSeeding}>
            <Text style={[styles.seedButtonText, { color: '#fff' }]}>
              {isSeeding ? 'Seeding…' : 'Seed remote entries'}
            </Text>
          </Pressable>
          {seedMessage ? (
            <Text style={[styles.detail, { color: palette.tint }]}>{seedMessage}</Text>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: palette.background }]}>
          <Text style={[styles.heading, { color: palette.text }]}>Reminders</Text>
          <View style={styles.row}>
            <Text style={[styles.label, { color: palette.icon }]}>Reminders</Text>
            <Switch
              value={settings.remindersEnabled}
              onValueChange={(value) => update({ remindersEnabled: value })}
              thumbColor={palette.background}
              trackColor={{ false: '#E5E7EB', true: palette.tint }}
            />
          </View>
          <View style={styles.reminderRow}>
            <Text style={[styles.label, { color: palette.icon }]}>Reminder hour</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={reminderInput}
              onChangeText={setReminderInput}
              onEndEditing={handleSaveReminder}
              placeholder="07"
              maxLength={2}
            />
          </View>
          <Text style={[styles.detail, { color: palette.icon }]}>
            Next reminder scheduled: {reminderLabel}
          </Text>
        </View>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: 16,
    paddingBottom: 80,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 3,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  detail: {
    fontSize: 14,
    marginBottom: 6,
  },
  syncRow: {
    marginTop: 6,
  },
  syncButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  syncButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  authRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  syncAction: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  syncActionText: {
    color: '#fff',
    fontWeight: '600',
  },
  seedButton: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  seedButtonText: {
    fontWeight: '600',
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  input: {
    width: 70,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlign: 'center',
  },
});
