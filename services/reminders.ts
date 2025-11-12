import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

const normalizeHour = (hour: number) => {
  if (Number.isNaN(hour) || hour < 0 || hour > 23) {
    return 7;
  }
  return Math.floor(hour);
};

type NotificationTrigger = {
  hour: number;
  minute: number;
  repeats: boolean;
};

type NotificationContent = {
  title: string;
  body: string;
  sound?: string;
};

type NotificationsModule = {
  getPermissionsAsync: () => Promise<{ granted: boolean }>;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  scheduleNotificationAsync: (
    options: { content: NotificationContent; trigger: NotificationTrigger },
  ) => Promise<string>;
  cancelScheduledNotificationAsync: (identifier: string) => Promise<void>;
};

const loadNotificationsModule = (): NotificationsModule | null => {
  if (isWeb) return null;
  try {
    const mod = eval('require')('expo-notifications');
    return mod as NotificationsModule;
  } catch {
    return null;
  }
};

const buildTrigger = (hour: number): NotificationTrigger => ({
  hour: normalizeHour(hour),
  minute: 0,
  repeats: true,
});

export const ensureNotificationPermission = async () => {
  const Notifications = loadNotificationsModule();
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
};

export const scheduleDailyReminder = async (
  hour: number,
  existingIdentifier?: string | null,
) => {
  const Notifications = loadNotificationsModule();
  if (!Notifications) return null;
  if (!(await ensureNotificationPermission())) return null;
  if (existingIdentifier) {
    try {
      await Notifications.cancelScheduledNotificationAsync(existingIdentifier);
    } catch {
      // best effort
    }
  }
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'TrakMass Reminder',
      body: 'Log your mass reading for today.',
      sound: 'default',
    },
    trigger: buildTrigger(hour),
  });
  return identifier;
};

export const cancelScheduledReminder = async (identifier?: string | null) => {
  const Notifications = loadNotificationsModule();
  if (!Notifications || !identifier) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // ignore
  }
};
