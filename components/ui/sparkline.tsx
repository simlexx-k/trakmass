import { StyleSheet, View } from 'react-native';

type SparklineProps = {
  data: number[];
  color?: string;
  height?: number;
};

export const Sparkline = ({ data, color = '#0a7ea4', height = 72 }: SparklineProps) => {
  if (data.length === 0) {
    return <View style={[styles.container, { height }]} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(1, max - min);

  return (
    <View style={[styles.container, { height }]}>
      {data.map((value, index) => {
        const normalized = (value - min) / range;
        return (
          <View key={`${value}-${index}`} style={styles.barWrapper}>
            <View
              style={[
                styles.bar,
                {
                  height: Math.max(2, normalized * height),
                  backgroundColor: color,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  barWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: 999,
    width: '100%',
  },
});
