import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProfileStore } from '@/store/useProfileStore';

type NavKey = 'dashboard' | 'profile' | 'insights' | 'settings';

type NavItem = {
  key: NavKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
};

const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'speedometer-outline', route: '/(tabs)' },
  { key: 'profile', label: 'Profile', icon: 'person-circle-outline', route: '/(tabs)/profile' },
  { key: 'insights', label: 'Insights', icon: 'analytics-outline', route: '/(tabs)/insights' },
  { key: 'settings', label: 'Settings', icon: 'settings-outline', route: '/(tabs)/settings' },
];

interface AppShellProps {
  title?: string;
  activeRoute: NavKey;
  children: React.ReactNode;
}

export const AppShell = ({ title = 'Dashboard', activeRoute, children }: AppShellProps) => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { profile, hydrate, isHydrated } = useProfileStore();

  useEffect(() => {
    if (!isHydrated) {
      hydrate().catch(() => undefined);
    }
  }, [hydrate, isHydrated]);

  useEffect(() => {
    if (isDesktop) {
      setSidebarOpen(false);
    }
  }, [isDesktop]);

  const initials =
    profile?.fullName
      ?.split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? 'TM';

  const handleNavigate = (item: NavItem) => {
    router.push(item.route);
    if (!isDesktop) {
      setSidebarOpen(false);
    }
  };

  const sidebar = (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: palette.background,
          borderRightColor: palette.icon,
        },
        !isDesktop && styles.sidebarFloating,
      ]}>
      <Text style={styles.brand}>TrakMass</Text>
      <View style={styles.sidebarNav}>
        {navItems.map((item) => {
          const isActive = item.key === activeRoute;
          return (
            <Pressable
              key={item.key}
              onPress={() => handleNavigate(item)}
              style={[
                styles.sidebarButton,
                isActive && { backgroundColor: palette.tint + '22' },
              ]}>
              <Ionicons
                name={item.icon}
                size={20}
                color={isActive ? palette.tint : palette.icon}
              />
              <Text
                style={[
                  styles.sidebarLabel,
                  { color: isActive ? palette.tint : palette.text },
                ]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: palette.background }]}
      edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        {isDesktop ? (
          sidebar
        ) : (
          <>
            {sidebarOpen && (
              <>
                <Pressable style={styles.overlay} onPress={() => setSidebarOpen(false)} />
                {sidebar}
              </>
            )}
          </>
        )}
        <View style={styles.contentArea}>
          <View
            style={[
              styles.header,
              { borderBottomColor: palette.icon + '33' },
            ]}>
            {!isDesktop && (
              <Pressable
                accessibilityLabel="Toggle navigation"
                onPress={() => setSidebarOpen((prev) => !prev)}
                style={styles.iconButton}>
                <Ionicons name="menu" size={22} color={palette.text} />
              </Pressable>
            )}
            <View style={styles.headerTitles}>
              <Text style={[styles.pageTitle, { color: palette.text }]}>{title}</Text>
              <Text style={[styles.pageSubtitle, { color: palette.icon }]}>
                Offline-first body mass tracking
              </Text>
            </View>
            <Pressable
              style={styles.profileButton}
              onPress={() => router.push('/(tabs)/profile')}>
              <View style={[styles.avatar, { backgroundColor: palette.tint + '22' }]}>
                <Text style={[styles.avatarText, { color: palette.tint }]}>{initials}</Text>
              </View>
              <View>
                <Text style={[styles.profileLabel, { color: palette.text }]}>
                  {profile?.fullName || 'Guest'}
                </Text>
                <Text style={[styles.profileRole, { color: palette.icon }]}>Open mode</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.icon} />
            </Pressable>
          </View>
          <View style={styles.mainContent}>{children}</View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 260,
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderRightWidth: StyleSheet.hairlineWidth,
    zIndex: 30,
  },
  sidebarFloating: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 5,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 20,
  },
  brand: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 24,
  },
  sidebarNav: {
    gap: 8,
  },
  sidebarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  sidebarLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  contentArea: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitles: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  pageSubtitle: {
    marginTop: 2,
    fontSize: 13,
  },
  iconButton: {
    padding: 8,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  profileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '700',
  },
  profileLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  profileRole: {
    fontSize: 12,
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
});
