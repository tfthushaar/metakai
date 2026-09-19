import Storage from '../../core/store/kv';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { hasAiKey, useAiKeys } from '../../core/aiKey';
import { AiUnavailable, routeChat } from '../../core/aiRouter';
import { useTheme } from '../../core/theme/ThemeProvider';
import { SPACE } from '../../core/theme/typography';
import { COACH_SCHEMA, COACH_SHAPE, COACH_SYSTEM, coachPayload, parseCoachReply, type CoachInput, type CoachReply } from '../../lib/coach';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';

const CACHE_KEY = 'metakai.coach';

function readCache(): { key: string; reply: CoachReply } | null {
  try {
    return JSON.parse(Storage.getItemSync(CACHE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

/** Coach notes for the current check-in. Only asks the model when the user taps, and caches the answer. */
export function CoachCard({ input }: { input: CoachInput }) {
  const { colors } = useTheme();
  const router = useRouter();
  const keys = useAiKeys();
  const payload = coachPayload(input);
  const cached = readCache();
  const [reply, setReply] = useState<CoachReply | null>(cached?.reply ?? null);
  const [stale, setStale] = useState(cached != null && cached.key !== payload);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const raw = await routeChat({ system: COACH_SYSTEM, user: payload, schema: COACH_SCHEMA, shapeHint: COACH_SHAPE, temperature: 0.4 });
      const parsed = parseCoachReply(raw);
      if (!parsed) throw new Error('The coach gave an answer that couldn’t be used. Try again.');
      setReply(parsed);
      setStale(false);
      try {
        Storage.setItemSync(CACHE_KEY, JSON.stringify({ key: payload, reply: parsed }));
      } catch {
        // Cache is optional.
      }
    } catch (e) {
      setError(e instanceof AiUnavailable || e instanceof Error ? e.message : 'Couldn’t reach the coach.');
    } finally {
      setBusy(false);
    }
  };

  const action = !hasAiKey(keys)
    ? { label: 'Add an AI key', onPress: () => router.push('/settings/ai') }
    : !reply || stale
      ? { label: reply ? 'Update notes' : 'Get notes', onPress: ask }
      : null;

  return (
    <Card style={{ marginTop: SPACE.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
        <Icon name="sparkles" size={16} color={colors.accent} />
        <Text variant="headline" style={{ flex: 1 }}>
          Coach
        </Text>
        {busy ? (
          <ActivityIndicator color={colors.textSecondary} />
        ) : (
          action && (
            <Text variant="subhead" weight="semibold" color={colors.accent} onPress={action.onPress} suppressHighlighting>
              {action.label}
            </Text>
          )
        )}
      </View>
      {reply ? (
        <View style={{ marginTop: SPACE.sm, gap: SPACE.md, opacity: stale ? 0.55 : 1 }}>
          <Text variant="callout">{reply.summary}</Text>
          {reply.notes.map((n) => (
            <View key={n.title} style={{ gap: 2 }}>
              <Text variant="subhead" weight="semibold">
                {n.title}
              </Text>
              <Text variant="subhead" tone="secondary">
                {n.detail}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text variant="subhead" tone="secondary" style={{ marginTop: 4 }}>
          {hasAiKey(keys) ? 'A short read of your last four weeks with next steps.' : 'Uses your own free Gemini or Groq key. Only weekly totals are sent.'}
        </Text>
      )}
      {error && (
        <Text variant="footnote" tone="danger" style={{ marginTop: SPACE.sm }}>
          {error}
        </Text>
      )}
    </Card>
  );
}
