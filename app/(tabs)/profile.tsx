import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { useProfileStore } from '@/store/useProfileStore';
import { useAuth } from '@/hooks/use-auth';
import type { MassUnit } from '@/types/mass';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const unitOptions: MassUnit[] = ['kg', 'lb'];

export default function ProfileScreen() {
  const { profile, hydrate, isHydrated, save } = useProfileStore();
  const { user, isAuthenticated } = useAuth();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [goalMass, setGoalMass] = useState('');
  const [unitPreference, setUnitPreference] = useState<MassUnit>('kg');
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isHydrated) {
      hydrate().catch(() => undefined);
    }
  }, [hydrate, isHydrated]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
      setEmail(profile.email ?? '');
      setBio(profile.bio ?? '');
      setUnitPreference(profile.unitPreference);
      setGoalMass(profile.goalMass ? String(profile.goalMass) : '');
    }
  }, [profile]);

  useEffect(() => {
    if (!profile && isAuthenticated && user) {
      setFullName(user.name ?? '');
      setEmail(user.email ?? '');
    }
  }, [profile, isAuthenticated, user]);

  const completion = useMemo(() => {
    const fields = [fullName.trim(), email.trim(), goalMass.trim(), bio.trim()];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [bio, email, fullName, goalMass]);

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert('Name required', 'Please enter your name to personalize the app.');
      return;
    }
    setSaving(true);
    setStatusMessage(null);
    try {
      const parsedGoal = goalMass.trim() ? Number.parseFloat(goalMass) : undefined;
      await save({
        fullName,
        email,
        bio,
        unitPreference,
        goalMass: Number.isNaN(parsedGoal) ? undefined : parsedGoal,
      });
      setStatusMessage('Profile saved locally.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save profile';
      setStatusMessage(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell activeRoute="profile" title="Profile">
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: '#fff' }]}>
          <Text style={styles.sectionTitle}>Personal Details</Text>
          <TextInput
            placeholder="Full name"
            style={[styles.input, isAuthenticated && styles.readOnlyInput]}
            value={fullName}
            onChangeText={setFullName}
            editable={!isAuthenticated}
          />
          <TextInput
            placeholder="Email (optional)"
            style={[styles.input, isAuthenticated && styles.readOnlyInput]}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            editable={!isAuthenticated}
          />
          <TextInput
            placeholder="Tell us about your goals"
            style={[styles.input, styles.bioInput]}
            multiline
            value={bio}
            onChangeText={setBio}
          />
        </View>

        <View style={[styles.card, { backgroundColor: '#fff' }]}>
          <Text style={styles.sectionTitle}>Tracking Preferences</Text>
          <Text style={styles.label}>Preferred unit</Text>
          <View style={styles.unitRow}>
            {unitOptions.map((unit) => {
              const active = unitPreference === unit;
              return (
                <Pressable
                  key={unit}
                  style={[
                    styles.unitButton,
                    active && { backgroundColor: palette.tint },
                  ]}
                  onPress={() => setUnitPreference(unit)}>
                  <Text
                    style={[
                      styles.unitLabel,
                      { color: active ? palette.background : palette.text },
                    ]}>
                    {unit.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>Target mass</Text>
          <TextInput
            placeholder={`e.g. 70 (${unitPreference})`}
            style={styles.input}
            keyboardType="numeric"
            value={goalMass}
            onChangeText={setGoalMass}
          />
        </View>

        <View style={[styles.card, { backgroundColor: '#fff' }]}>
          <Text style={styles.sectionTitle}>Progress</Text>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${completion}%`, backgroundColor: palette.tint },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>{completion}% profile complete</Text>
        </View>

        {statusMessage ? (
          <Text style={[styles.statusMessage, { color: palette.tint }]}>{statusMessage}</Text>
        ) : null}

        <Pressable
          style={[styles.saveButton, { backgroundColor: palette.tint }]}
          disabled={saving}
          onPress={handleSave}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Profile'}</Text>
        </Pressable>
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
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  readOnlyInput: {
    backgroundColor: '#F5F5F7',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  unitRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  unitButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  unitLabel: {
    fontWeight: '700',
  },
  progressBarContainer: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E5E5EA',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  saveButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusMessage: {
    fontSize: 14,
    fontWeight: '600',
  },
});
