import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { MassEntry, MassUnit } from '@/types/mass';
import { useMassStore } from '@/store/useMassStore';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppShell } from '@/components/layout/AppShell';
import { Camera as CameraModule, CameraView } from 'expo-camera';
import { useProfileStore } from '@/store/useProfileStore';
import { Path, Svg } from 'react-native-svg';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { syncPendingEntries } from '@/services/sync';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useAuth } from '@/hooks/use-auth';

const DEFAULT_PROFILE_ID = 'default';
const PAGE_SIZE = 20;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatRelativeTime = (timestamp?: string | null) => {
  if (!timestamp) return 'Never synced';
  const ms = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function HomeScreen() {
  const { entries, isHydrated, hydrate, addEntry } = useMassStore();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const [unit, setUnit] = useState<MassUnit>('kg');
  const [massValue, setMassValue] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isQuickAddVisible, setIsQuickAddVisible] = useState(false);
  const [isCameraScannerVisible, setIsCameraScannerVisible] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const isCameraAvailable = Platform.OS !== 'web';
  const { profile } = useProfileStore();
  const { accessToken } = useAuth();
  const {
    settings,
    hydrate: hydrateSettings,
    isHydrated: areSettingsHydrated,
    setLastSync,
  } = useSettingsStore();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSyncingCard, setIsSyncingCard] = useState(false);
  const closeQuickAdd = () => {
    setIsQuickAddVisible(false);
    setIsCameraScannerVisible(false);
    setScanFeedback(null);
    setError(null);
  };

  useEffect(() => {
    hydrate(DEFAULT_PROFILE_ID).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load entries');
    });
  }, [hydrate]);

  useEffect(() => {
    if (!areSettingsHydrated) {
      hydrateSettings().catch(() => undefined);
    }
  }, [areSettingsHydrated, hydrateSettings]);

  const latestEntry = entries[0];

  const average30 = useMemo(() => {
    if (entries.length === 0) return null;
    const windowEntries = entries.slice(0, 30);
    const total = windowEntries.reduce((sum, entry) => sum + entry.mass, 0);
    return total / windowEntries.length;
  }, [entries]);

  const trendData = useMemo<TrendSnapshot | null>(() => {
    if (entries.length === 0) return null;
    const sample = entries.slice(0, 12);
    if (sample.length === 0) return null;
    const points = [...sample].reverse();
    if (points.length === 0) return null;
    const masses = points.map((item) => item.mass);
    const minMass = Math.min(...masses);
    const maxMass = Math.max(...masses);
    const first = points[0];
    const latest = points[points.length - 1];
    const change = latest.mass - first.mass;
    return { points, minMass, maxMass, change, first, latest };
  }, [entries]);
  const canShowTrend = Boolean(trendData && trendData.points.length >= 2);
  const goalProgress = useMemo(() => {
    const goalMass = profile?.goalMass;
    if (!goalMass || !latestEntry) return null;
    const initialEntry = entries[entries.length - 1] ?? latestEntry;
    const initialMass = initialEntry.mass;
    const totalDelta = goalMass - initialMass;
    if (totalDelta === 0) {
      return {
        goalMass,
        progress: 1,
        initialMass,
        totalDelta,
        remaining: 0,
        direction: 'flat' as const,
      };
    }
    const currentDelta = latestEntry.mass - initialMass;
    const progress = clamp(currentDelta / totalDelta, 0, 1);
    return {
      goalMass,
      progress,
      initialMass,
      totalDelta,
      remaining: goalMass - latestEntry.mass,
      direction: totalDelta > 0 ? 'up' as const : 'down' as const,
    };
  }, [entries, latestEntry, profile?.goalMass]);
  const pendingSyncCount = useMemo(
    () => entries.filter((entry) => entry.status !== 'synced').length,
    [entries],
  );
  const lastSyncText = formatRelativeTime(settings.lastSync);
  const nextReminderText = useMemo(() => {
    if (!settings.remindersEnabled) return 'Disabled';
    const hour = clamp(settings.reminderHour, 0, 23);
    const now = new Date();
    const next = new Date();
    next.setHours(hour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [settings.reminderHour, settings.remindersEnabled]);
  const handleDashboardSync = useCallback(async () => {
    setIsSyncingCard(true);
    setSyncMessage(null);
    try {
      const stats = await syncPendingEntries(accessToken ?? undefined);
      if (stats.skipped) {
        setSyncMessage(`Sync skipped: ${stats.reason ?? 'feature disabled'}`);
      } else {
        setSyncMessage(`Synced ${stats.synced}/${stats.attempted} changes`);
        if (stats.attempted > 0) {
          await setLastSync(new Date().toISOString());
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setSyncMessage(`Sync failed: ${message}`);
    } finally {
      setIsSyncingCard(false);
    }
  }, [setLastSync, accessToken]);
  const autoSyncLabel = settings.autoSync ? 'Auto sync enabled' : 'Auto sync paused';
  const visibleEntries = entries.slice(0, visibleCount);
  const canLoadMore = visibleCount < entries.length;
  const handleLoadMore = useCallback(() => {
    if (!canLoadMore) return;
    setVisibleCount((prev) => Math.min(entries.length, prev + PAGE_SIZE));
  }, [canLoadMore, entries.length]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await hydrate(DEFAULT_PROFILE_ID);
    setIsRefreshing(false);
  };

  const handleSubmit = async () => {
    const numericValue = Number.parseFloat(massValue);
    if (Number.isNaN(numericValue) || numericValue <= 0) {
      setError('Enter a valid mass value.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await addEntry({
        profileId: DEFAULT_PROFILE_ID,
        mass: numericValue,
        unit,
        note: note.trim() ? note.trim() : undefined,
      });
      setMassValue('');
      setNote('');
      closeQuickAdd();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.headerStack}>
      <View style={[styles.quickAddBanner, { backgroundColor: palette.background }]}>
        <View style={styles.quickAddText}>
          <Text style={styles.cardTitle}>Track a reading</Text>
          <Text style={[styles.quickAddSubtitle, { color: palette.icon }]}>
            Log manually or use the camera to capture an electronic scale.
          </Text>
        </View>
        <Pressable
          style={[styles.quickAddButton, { backgroundColor: palette.tint }]}
          onPress={() => {
            setIsQuickAddVisible(true);
            setScanFeedback(null);
          }}>
          <Text style={styles.quickAddButtonText}>Quick add</Text>
        </Pressable>
      </View>
      <View style={[styles.kpiRow, { marginBottom: 16 }]}>
        <KpiBlock label="Current" value={latestEntry ? `${latestEntry.mass} ${latestEntry.unit}` : '—'} />
        <KpiBlock
          label="30d Avg"
          value={average30 ? `${average30.toFixed(1)} ${unit}` : '—'}
        />
      </View>

      <View style={[styles.card, styles.graphCard, { backgroundColor: palette.background }]}>
        <View style={styles.graphHeader}>
          <Text style={styles.cardTitle}>Progress Trend</Text>
          {canShowTrend && trendData ? (
            <View
              style={[
                styles.trendBadge,
                trendData.change > 0
                  ? styles.trendUp
                  : trendData.change < 0
                    ? styles.trendDown
                    : styles.trendFlat,
              ]}>
              <Text style={styles.trendBadgeText}>
                {trendData.change > 0 ? '+' : ''}
                {trendData.change.toFixed(1)} {trendData.latest.unit}
              </Text>
            </View>
          ) : null}
        </View>
        {trendData ? (
          canShowTrend ? (
            <>
              <Text style={[styles.graphSubtitle, { color: palette.icon }]}>
                {trendData.points.length} recent logs · {trendData.minMass.toFixed(1)} –{' '}
                {trendData.maxMass.toFixed(1)} {trendData.latest.unit}
              </Text>
              <TrendGraph
                palette={palette}
                points={trendData.points}
                min={trendData.minMass}
                max={trendData.maxMass}
              />
              <View style={styles.graphFooter}>
                <View>
                  <Text style={[styles.graphFooterLabel, { color: palette.icon }]}>
                    {new Date(trendData.first.loggedAt).toLocaleDateString()}
                  </Text>
                  <Text style={styles.graphFooterValue}>
                    {trendData.first.mass.toFixed(1)} {trendData.first.unit}
                  </Text>
                </View>
                <View style={styles.graphFooterRight}>
                  <Text style={[styles.graphFooterLabel, { color: palette.icon }]}>
                    {new Date(trendData.latest.loggedAt).toLocaleDateString()}
                  </Text>
                  <Text style={styles.graphFooterValue}>
                    {trendData.latest.mass.toFixed(1)} {trendData.latest.unit}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={[styles.graphEmptyState, { color: palette.icon }]}>
              Add one more entry to unlock the trend visualization.
            </Text>
          )
        ) : (
          <Text style={[styles.graphEmptyState, { color: palette.icon }]}>
            Log your first entry to see how your progress evolves.
          </Text>
        )}
      </View>
      {goalProgress ? (
        <View style={[styles.goalCard, { backgroundColor: palette.background }]}>
          <Text style={styles.goalCardTitle}>Goal progress</Text>
          <Text style={[styles.goalCardLabel, { color: palette.icon }]}>
            Goal: {goalProgress.goalMass.toFixed(1)} kg
          </Text>
          <Text style={styles.goalCardStatus}>
            {goalProgress.progress >= 1
              ? 'Target reached 🎉'
              : `${Math.abs(goalProgress.remaining).toFixed(1)} kg ${goalProgress.direction === 'down' ? 'to lose' : 'to gain'}`}
          </Text>
          <View style={styles.goalProgressBar}>
            <View
              style={[
                styles.goalProgressFill,
                {
                  width: `${Math.max(1, goalProgress.progress * 100)}%`,
                  backgroundColor: palette.tint,
                },
              ]}
            />
          </View>
          <View style={styles.goalMilestonesRow}>
            {[0.25, 0.5, 0.75, 1].map((percent) => {
              const milestoneMass = goalProgress.initialMass + goalProgress.totalDelta * percent;
              const reached = goalProgress.progress >= percent;
              return (
                <View
                  key={percent}
                  style={[
                    styles.goalMilestoneChip,
                    reached && { backgroundColor: palette.tint },
                  ]}>
                  <Text style={[styles.goalMilestoneText, reached && { color: '#fff' }]}>
                    {milestoneMass.toFixed(1)} kg
                  </Text>
                  <Text style={[styles.goalMilestoneRel, reached && { color: '#fff' }]}>
                    ✦ {Math.round(percent * 100)}%
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
      <View style={[styles.syncCard, { backgroundColor: palette.background }]}>
        <View style={styles.syncCardRow}>
          <Text style={[styles.syncHeading, { color: palette.text }]}>Sync & reminders</Text>
          <Pressable
            style={[styles.syncAction, { backgroundColor: palette.tint }]}
            onPress={handleDashboardSync}
            disabled={isSyncingCard}>
            <Text style={styles.syncActionText}>{isSyncingCard ? 'Syncing…' : 'Sync Now'}</Text>
          </Pressable>
        </View>
        <Text style={[styles.syncLabel, { color: palette.icon }]}>{autoSyncLabel}</Text>
        <Text style={[styles.syncDetail, { color: palette.icon }]}>Last sync {lastSyncText}</Text>
        <Text style={[styles.syncDetail, { color: palette.icon }]}>
          Pending entries: {pendingSyncCount}
        </Text>
        <Text style={[styles.syncDetail, { color: palette.icon }]}>
          {settings.remindersEnabled
            ? `Next reminder at ${nextReminderText}`
            : 'Reminders disabled'}
        </Text>
        {syncMessage ? (
          <Text style={[styles.syncDetail, { color: palette.tint }]}>{syncMessage}</Text>
        ) : null}
      </View>
    </View>
  );

  const content = (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.container}>
      <FlatList
        data={visibleEntries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <Text style={[styles.emptyState, { color: palette.icon }]}>
            No entries yet. Start logging to see trends.
          </Text>
        }
        ListHeaderComponent={renderHeader}
        ListFooterComponent={
          canLoadMore ? (
            <View style={styles.loadMoreIndicator}>
              <ActivityIndicator />
            </View>
          ) : null
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => <EntryCard entry={item} palette={palette} />}
      />
    </KeyboardAvoidingView>
  );

  const quickAddModal = (
    <Modal
      visible={isQuickAddVisible}
      animationType="slide"
      transparent
      onRequestClose={closeQuickAdd}
      statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: 'height' })}
        style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: palette.background }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.cardTitle}>Quick Add</Text>
              <Text style={[styles.quickAddSubtitle, { color: palette.icon }]}>
                Manual entry or camera capture.
              </Text>
            </View>
            <Pressable onPress={closeQuickAdd}>
              <Text style={[styles.quickAddButtonText, { color: palette.tint }]}>Close</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled">
            <View style={styles.formRow}>
              <TextInput
                style={styles.massInput}
                keyboardType="numeric"
                placeholder="70.4"
                value={massValue}
                onChangeText={setMassValue}
                returnKeyType="done"
              />
              <View style={styles.unitToggle}>
                {(['kg', 'lb'] as MassUnit[]).map((item) => {
                  const selected = item === unit;
                  return (
                    <Pressable
                      key={item}
                      onPress={() => setUnit(item)}
                      style={[
                        styles.unitButton,
                        selected && { backgroundColor: palette.tint },
                      ]}>
                      <Text
                        style={[
                          styles.unitText,
                          { color: palette.icon },
                          selected && { color: palette.background },
                        ]}>
                        {item.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <TextInput
              style={styles.noteInput}
              placeholder="Notes or tags (optional)"
              value={note}
              onChangeText={setNote}
              multiline
            />
            {!!error && <Text style={styles.errorText}>{error}</Text>}
            <Pressable
              disabled={isSubmitting}
              onPress={handleSubmit}
              style={[
                styles.submitButton,
                { backgroundColor: palette.tint },
                isSubmitting && styles.submitButtonDisabled,
              ]}>
              <Text style={styles.submitButtonText}>{isSubmitting ? 'Saving…' : 'Save Entry'}</Text>
            </Pressable>
            <Text style={[styles.cameraSectionTitle, { color: palette.icon }]}>
              Use camera to capture
            </Text>
            <Text style={[styles.cameraSectionCopy, { color: palette.icon }]}>
              Align the electronic scale display and capture the digits.
            </Text>
            {isCameraAvailable ? (
              isCameraScannerVisible ? (
                <CameraScanner
                  palette={palette}
                  onDetected={(value, text) => {
                    if (value !== undefined) {
                      setMassValue(value.toFixed(1));
                      setScanFeedback(`Detected ${value.toFixed(1)} ${unit}`);
                      setIsCameraScannerVisible(false);
                    } else if (text) {
                      setScanFeedback(text);
                    }
                  }}
                  onClose={() => setIsCameraScannerVisible(false)}
                />
              ) : (
                <Pressable
                  style={[styles.cameraToggle, { borderColor: palette.tint }]}
                  onPress={() => {
                    setIsCameraScannerVisible(true);
                    setScanFeedback(null);
                  }}>
                  <Text style={[styles.cameraToggleText, { color: palette.background }]}>Open camera</Text>
                </Pressable>
              )
            ) : (
              <Text style={[styles.cameraSectionCopy, { color: palette.icon }]}>
                Camera capture is available on native devices only.
              </Text>
            )}
            {!!scanFeedback && (
              <Text style={[styles.scanFeedback, { color: palette.icon }]}>{scanFeedback}</Text>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  if (!isHydrated && entries.length === 0) {
    return (
      <AppShell activeRoute="dashboard" title="Dashboard">
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.centerText}>Loading your offline log…</Text>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell activeRoute="dashboard" title="Dashboard">
      {content}
      {quickAddModal}
    </AppShell>
  );
}

const EntryCard = ({
  entry,
  palette,
}: {
  entry: ReturnType<typeof useMassStore>['entries'][number];
  palette: typeof Colors.light;
}) => {
  const date = new Date(entry.loggedAt);
  return (
    <View style={[styles.entryCard, { backgroundColor: palette.background }]}>
      <View>
        <Text style={styles.entryValue}>
          {entry.mass} {entry.unit}
        </Text>
        <Text style={[styles.entryDate, { color: palette.icon }]}>
          {date.toLocaleDateString()} · {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {entry.note ? <Text style={[styles.entryNote, { color: palette.text }]}>{entry.note}</Text> : null}
      </View>
      <StatusBadge status={entry.status} />
    </View>
  );
};

const KpiBlock = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.kpiBlock}>
    <Text style={styles.kpiLabel}>{label}</Text>
    <Text style={styles.kpiValue}>{value}</Text>
  </View>
);

function TrendGraph({ points, min, max, palette }: TrendGraphProps) {
  const [width, setWidth] = useState(0);
  const height = 140;
  const span = max - min || 1;

  const chartPoints = useMemo(() => {
    if (width <= 0 || points.length === 0) return [];
    const step = points.length > 1 ? width / (points.length - 1) : width;
    return points.map((point, index) => {
      const normalized = (point.mass - min) / span;
      return {
        x: step * index,
        y: height - normalized * height,
      };
    });
  }, [points, width, min, span, height]);

  const path = useMemo(
    () => (chartPoints.length < 2 ? '' : buildSmoothPath(chartPoints)),
    [chartPoints],
  );

  const areaPath = useMemo(() => {
    if (!path || chartPoints.length === 0) return '';
    const lastPoint = chartPoints[chartPoints.length - 1];
    return `${path} L${lastPoint.x},${height} L0,${height} Z`;
  }, [chartPoints, height, path]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.graphChart} onLayout={handleLayout}>
      {path && width ? (
        <Svg width={width} height={height} fill="none">
          <Path d={areaPath} fill={palette.tint} opacity={0.15} />
          <Path
            d={path}
            stroke={palette.tint}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      ) : (
        <View style={StyleSheet.absoluteFill} />
      )}
    </View>
  );
}

const CameraScanner = ({ palette, onDetected, onClose }: CameraScannerProps) => {
  const cameraRef = useRef<InstanceType<typeof CameraView> | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [infoText, setInfoText] = useState<string | null>(null);

  const requestPermission = useCallback(async () => {
    if (Platform.OS === 'web') {
      setHasPermission(false);
      return;
    }
    setHasPermission(null);
    try {
      const result = await CameraModule.requestCameraPermissionsAsync();
      setHasPermission(result.granted ?? false);
    } catch {
      setHasPermission(false);
    }
  }, []);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    if (!hasPermission) {
      await requestPermission();
      return;
    }
    setIsProcessing(true);
    setInfoText(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
      });
      let recognizedText: string | undefined;
      let recognizedValue: number | undefined;
      try {
        const result = await TextRecognition.recognize(photo.uri);
        recognizedText = result.text ?? undefined;
        if (recognizedText) {
          const digitsMatch = recognizedText.match(/(\d+(?:\.\d+)?)/);
          if (digitsMatch) {
            recognizedValue = Number(digitsMatch[0]);
          } else {
            setInfoText('No digits detected in the capture.');
          }
        }
        if (recognizedText) {
          setInfoText(`Detected text: ${recognizedText}`);
        }
      } catch (recognitionError) {
        const message =
          recognitionError instanceof Error
            ? recognitionError.message
            : 'Text recognition is not available in this build.';
        setInfoText(message);
      }
      onDetected(recognizedValue, recognizedText);
    } finally {
      setIsProcessing(false);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.cameraPlaceholder}>
        <ActivityIndicator color={palette.icon} />
        <Text style={[styles.cameraPlaceholderText, { color: palette.icon, marginTop: 8 }]}>Requesting camera access…</Text>
        <Pressable onPress={onClose} style={styles.cameraCancel}>
          <Text style={[styles.cameraCancelText, { color: palette.tint }]}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.cameraPlaceholder}>
        <Text style={[styles.cameraPlaceholderText, { color: palette.icon }]}>Camera access is required to scan your scale display.</Text>
        <Pressable
          style={[styles.cameraAction, { backgroundColor: palette.tint }]}
          onPress={requestPermission}>
          <Text style={styles.cameraActionText}>Grant access</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.cameraCancel}>
          <Text style={[styles.cameraCancelText, { color: palette.tint }]}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.cameraPreview}>
        <CameraView
          ref={(instance) => {
            cameraRef.current = instance;
          }}
          style={StyleSheet.absoluteFill}
          type="back"
          autoFocus="on"
        />
        <View style={styles.cameraOverlay} pointerEvents="none" />
      </View>
      <View style={styles.cameraControls}>
        <Pressable
          style={[styles.cameraAction, { backgroundColor: palette.tint }]}
          onPress={handleCapture}
          disabled={isProcessing}>
          {isProcessing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.cameraActionText}>Capture reading</Text>
          )}
        </Pressable>
        <Pressable style={styles.cameraCancel} onPress={onClose}>
          <Text style={[styles.cameraCancelText, { color: palette.tint }]}>Close</Text>
        </Pressable>
      </View>
      {infoText ? (
        <Text style={[styles.scanFeedback, { color: palette.icon }]}>{infoText}</Text>
      ) : null}
    </View>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const label = status === 'synced' ? 'Synced' : status === 'failed' ? 'Retrying' : 'Offline';
  const badgeStyle =
    status === 'synced'
      ? styles.badgeSynced
      : status === 'failed'
        ? styles.badgeFailed
        : styles.badgePending;
  return (
    <View style={[styles.badge, badgeStyle]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 0,
  },
  quickAddBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  quickAddSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  quickAddButton: {
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    marginTop: 8,
    flexShrink: 0,
  },
  quickAddButtonText: {
    fontWeight: '600',
    color: '#fff',
  },
  quickAddText: {
    flex: 1,
    minWidth: 0,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    borderRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalContent: {
    gap: 12,
    paddingBottom: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  centerText: {
    fontSize: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  massInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 4,
  },
  unitButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  unitText: {
    fontWeight: '600',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    padding: 12,
    minHeight: 60,
    marginTop: 12,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#d9534f',
    marginTop: 8,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  kpiRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  kpiBlock: {
    flex: 1,
    backgroundColor: '#F8F9FB',
    borderRadius: 12,
    padding: 12,
  },
  kpiLabel: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  listContent: {
    paddingBottom: 80,
    gap: 12,
    paddingHorizontal: 16,
  },
  headerStack: {
    gap: 16,
  },
  graphCard: {
    paddingBottom: 20,
    marginBottom: 16,
  },
  goalCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  goalCardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  goalCardLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  goalCardStatus: {
    fontSize: 14,
    marginTop: 2,
    fontWeight: '600',
  },
  goalProgressBar: {
    marginTop: 12,
    height: 8,
    backgroundColor: '#EEF1F5',
    borderRadius: 999,
    overflow: 'hidden',
  },
  goalProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  goalMilestonesRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  goalMilestoneChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  goalMilestoneText: {
    fontSize: 11,
    fontWeight: '600',
  },
  goalMilestoneRel: {
    fontSize: 9,
    color: '#6B7280',
  },
  syncCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  syncCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncHeading: {
    fontSize: 16,
    fontWeight: '600',
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
  syncLabel: {
    fontSize: 14,
    marginTop: 6,
  },
  syncDetail: {
    fontSize: 13,
    marginTop: 2,
  },
  cameraSectionTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  cameraSectionCopy: {
    fontSize: 13,
    marginTop: 2,
  },
  graphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  trendBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  trendBadgeText: {
    fontWeight: '600',
    color: '#fff',
  },
  trendUp: {
    backgroundColor: '#4caf50',
  },
  trendDown: {
    backgroundColor: '#ef5350',
  },
  trendFlat: {
    backgroundColor: '#9E9E9E',
  },
  graphSubtitle: {
    marginTop: 6,
    fontSize: 13,
  },
  graphChart: {
    height: 140,
    marginTop: 16,
  },
  graphFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  graphFooterLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  graphFooterValue: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  graphFooterRight: {
    alignItems: 'flex-end',
  },
  graphEmptyState: {
    textAlign: 'center',
    marginTop: 16,
  },
  loadMoreIndicator: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  cameraToggle: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  cameraToggleText: {
    fontWeight: '600',
    color: '#fff',
  },
  scanFeedback: {
    marginTop: 10,
    fontSize: 13,
    textAlign: 'center',
  },
  cameraPreview: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginTop: 12,
  },
  cameraControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  cameraAction: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraActionText: {
    fontWeight: '600',
    color: '#fff',
  },
  cameraCancel: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  cameraCancelText: {
    fontWeight: '600',
  },
  cameraPlaceholder: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D1D6',
    padding: 16,
    alignItems: 'center',
  },
  cameraPlaceholderText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 16,
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 16,
  },
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  entryValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  entryDate: {
    marginTop: 4,
  },
  entryNote: {
    marginTop: 8,
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  badgePending: {
    backgroundColor: '#FFF4E5',
  },
  badgeSynced: {
    backgroundColor: '#E6F5EA',
  },
  badgeFailed: {
    backgroundColor: '#FFE5E5',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0A0A0A',
  },
});

const buildSmoothPath = (points: ChartPoint[]) => {
  if (points.length === 0) return '';
  let path = `M${points[0].x},${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const prevPrev = points[index - 2] ?? previous;
    const next = points[index + 1] ?? current;
    const cp1 = getControlPoint(previous, prevPrev, current, false);
    const cp2 = getControlPoint(current, previous, next, true);
    path += ` C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${current.x},${current.y}`;
  }
  return path;
};

const getControlPoint = (
  current: ChartPoint,
  previous: ChartPoint,
  next: ChartPoint,
  reverse = false,
) => {
  const smoothing = 0.2;
  const angle = Math.atan2(next.y - previous.y, next.x - previous.x);
  const length = distance(previous, next) * smoothing;
  const direction = reverse ? Math.PI : 0;
  return {
    x: current.x + Math.cos(angle + direction) * length,
    y: current.y + Math.sin(angle + direction) * length,
  };
};

const distance = (a: ChartPoint, b: ChartPoint) => Math.hypot(b.x - a.x, b.y - a.y);

type ChartPoint = {
  x: number;
  y: number;
};

type TrendSnapshot = {
  points: MassEntry[];
  minMass: number;
  maxMass: number;
  change: number;
  first: MassEntry;
  latest: MassEntry;
};

type TrendGraphProps = {
  points: MassEntry[];
  min: number;
  max: number;
  palette: typeof Colors.light;
};

type CameraScannerProps = {
  palette: typeof Colors.light;
  onDetected: (value?: number, text?: string) => void;
  onClose: () => void;
};
