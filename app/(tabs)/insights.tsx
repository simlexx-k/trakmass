import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { useMassStore } from '@/store/useMassStore';
import { Sparkline } from '@/components/ui/sparkline';
import { useProfileStore } from '@/store/useProfileStore';
import { buildInsightSummaries, computeTrend, computeVolatility } from '@/services/analytics';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function InsightsScreen() {
  const { entries, hydrate, isHydrated } = useMassStore();
  const { profile } = useProfileStore();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    if (!isHydrated) {
      hydrate().catch(() => undefined);
    }
  }, [hydrate, isHydrated]);

  const summaries = useMemo(
    () => buildInsightSummaries(entries, profile?.goalMass ?? null),
    [entries, profile?.goalMass],
  );
  const trend = useMemo(() => computeTrend(entries), [entries]);
  const volatility = useMemo(() => computeVolatility(entries), [entries]);
  const entryCount = entries.length;
  const sparklineData = useMemo(
    () => entries.slice(0, 12).map((entry) => entry.mass).reverse(),
    [entries],
  );
  const stats = useMemo(
    () => [
      {
        label: 'Current mass',
        value: entries[0] ? `${entries[0].mass.toFixed(1)} ${entries[0].unit}` : '—',
      },
      {
        label: '7-day avg',
        value: (() => {
          const window = entries.slice(0, 7);
          if (!window.length) return '—';
          const avg = window.reduce((sum, entry) => sum + entry.mass, 0) / window.length;
          return `${avg.toFixed(1)} kg`;
        })(),
      },
      {
        label: 'Volatility',
        value: `${volatility.volatility.toFixed(2)} kg`,
      },
    ],
    [entries, volatility.volatility],
  );

  return (
    <AppShell activeRoute="insights" title="Insights">
      <View style={styles.grid}>
        <View style={[styles.summary, { backgroundColor: palette.tint }]}>
          <Text style={[styles.heading, { color: '#fff' }]}>Live Signals</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: '#E5E7EB' }]}>Entries Logged</Text>
            <Text style={styles.summaryValue}>{entryCount}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: '#E5E7EB' }]}>Current Trend</Text>
            <Text style={styles.summaryValue}>{trend.label}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: '#E5E7EB' }]}>Next Sync</Text>
            <Text style={styles.summaryValue}>auto</Text>
          </View>
        </View>
        <View style={styles.cardWrap}>
          <Text style={styles.sectionTitle}>Recent Stats</Text>
          <View style={styles.statsRow}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.metric}>
                <Text style={styles.metricLabel}>{stat.label}</Text>
                <Text style={styles.metricValue}>{stat.value}</Text>
              </View>
            ))}
          </View>
          <View style={styles.sparklineCard}>
            <Text style={styles.sparklineLabel}>Last {sparklineData.length} logs</Text>
            <Sparkline data={sparklineData} color={palette.tint} />
          </View>
        </View>
      </View>
      <View style={styles.insightFeed}>
        {summaries.map((summaryItem) => (
          <View key={summaryItem.title} style={styles.insightCard}>
            <Text style={styles.insightTitle}>{summaryItem.title}</Text>
            <Text style={styles.insightBody}>{summaryItem.body}</Text>
          </View>
        ))}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'column',
  },
  summary: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 5,
    marginBottom: 12,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cardWrap: {
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metric: {
    flex: 1,
    paddingRight: 12,
  },
  metricLabel: {
    fontSize: 13,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  sparklineCard: {
    marginTop: 6,
  },
  sparklineLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 6,
  },
  insightFeed: {
    marginTop: 18,
  },
  insightCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 1,
    marginBottom: 12,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  insightBody: {
    fontSize: 14,
    color: '#4B5563',
  },
});
