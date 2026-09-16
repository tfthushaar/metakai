import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { useBody } from '../core/goals/useBody';
import { useTheme } from '../core/theme/ThemeProvider';
import { SPACE } from '../core/theme/typography';
import { CATEGORY_LABEL, progressLabel } from '../lib/achievements';
import { dateKey, formatLong } from '../lib/dates';
import { durationLabel } from '../lib/geo';
import { ageGradeLabel, RANK_GROUP_LABEL } from '../lib/ranks';
import { readAchievements } from '../modules/achievements/repo';
import { AchievementBadge, CATEGORY_COLOR, TierBadge } from '../modules/ranks/components';
import { currentPhysiqueRank, currentRunRank } from '../modules/ranks/repo';
import { CARD, ShareCard, type ShareStat } from '../modules/ranks/ShareCard';
import { usePerson } from '../modules/ranks/usePerson';
import { Button } from '../ui/Button';
import { haptic } from '../ui/haptics';
import type { IconName } from '../ui/Icon';
import { Icon } from '../ui/Icon';
import { PressableScale } from '../ui/PressableScale';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

type Kind = 'achievement' | 'physique' | 'run';

export default function ShareCardScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { kind = 'achievement', id } = useLocalSearchParams<{ kind?: Kind; id?: string }>();
  const person = usePerson();
  const { targets } = useBody();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const cardWidth = Math.min(width - SPACE.lg * 2, 420);
  const today = formatLong(dateKey());

  const content = useMemo(() => {
    if (kind === 'achievement') {
      const a = readAchievements(person, targets?.protein ?? null).find((x) => x.def.id === id);
      if (!a) return null;
      const color = CATEGORY_COLOR[a.def.category];
      return {
        shareable: !!a.earnedAt,
        eyebrow: a.earnedAt ? 'Achievement unlocked' : CATEGORY_LABEL[a.def.category],
        title: a.def.title,
        subtitle: a.def.description,
        hero: <AchievementBadge icon={a.def.icon as IconName} earned={!!a.earnedAt} size={cardWidth * 0.36} color={color} />,
        stats: [
          { label: 'Category', value: CATEGORY_LABEL[a.def.category] },
          { label: a.earnedAt ? 'Earned' : 'Progress', value: a.earnedAt ? formatLong(dateKey(new Date(a.earnedAt))).replace(/^\w+, /, '') : progressLabel(a) },
        ] as ShareStat[],
        footnote: undefined,
        extra: null,
      };
    }
    if (!person) return null;
    if (kind === 'physique') {
      const r = currentPhysiqueRank(person);
      if (!r.rankedCount) return null;
      const top = [...r.groups].filter((g) => g.best).sort((a, b) => b.score - a.score);
      return {
        shareable: true,
        eyebrow: 'Physique pass',
        title: r.tier.label,
        subtitle: r.strongest ? `Strongest: ${RANK_GROUP_LABEL[r.strongest.group]} · ${r.strongest.tier.label}` : undefined,
        hero: <TierBadge tier={r.tier} size={cardWidth * 0.28} />,
        stats: top.slice(0, 3).map((g) => ({ label: RANK_GROUP_LABEL[g.group], value: g.tier.label })),
        footnote: today,
        extra: (
          <View style={styles.badgeRow}>
            {r.groups.map((g) => (
              <View key={g.group} style={styles.miniBadge}>
                <TierBadge tier={g.tier} size={cardWidth * 0.1} locked={!g.best} />
                <Text variant="caption" color={CARD.tertiary} numberOfLines={1} style={{ fontSize: 9 }}>
                  {RANK_GROUP_LABEL[g.group]}
                </Text>
              </View>
            ))}
          </View>
        ),
      };
    }
    const r = currentRunRank(person);
    if (!r.best) return null;
    return {
      shareable: true,
      eyebrow: 'Run pass',
      title: r.tier.label,
      subtitle: `${r.best.distance.label} in ${durationLabel(r.best.effort.timeSec)} · ${r.best.ageGrade.toFixed(1)}% age grade (${ageGradeLabel(r.best.ageGrade).toLowerCase()})`,
      hero: <TierBadge tier={r.tier} size={cardWidth * 0.38} />,
      stats: r.distances.slice(0, 3).map((d) => ({ label: d.distance.label, value: durationLabel(d.effort.timeSec) })),
      footnote: today,
      extra: null,
    };
  }, [kind, id, person, targets?.protein, cardWidth, today]);

  const share = async () => {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile', width: 1080 });
      haptic.success();
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share card' });
      else toast('Sharing is not available on this device');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create the image');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: SPACE.lg, paddingTop: insets.top + SPACE.sm, paddingBottom: insets.bottom + 120, alignItems: 'center' }}>
        <View style={styles.headerRow}>
          <Text variant="title2">Share</Text>
          <PressableScale onPress={() => router.back()} hitSlop={10} style={[styles.close, { backgroundColor: colors.fill }]}>
            <Icon name="close" size={18} color={colors.textSecondary} strokeWidth={2.6} />
          </PressableScale>
        </View>
        {content ? (
          <ShareCard
            ref={cardRef}
            width={cardWidth}
            eyebrow={content.eyebrow}
            title={content.title}
            subtitle={content.subtitle}
            hero={content.hero}
            stats={content.stats}
            footnote={content.footnote}
          >
            {content.extra}
          </ShareCard>
        ) : (
          <Text variant="subhead" tone="secondary" style={{ marginTop: SPACE.xl }}>
            Nothing to share yet.
          </Text>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACE.md, backgroundColor: colors.background, borderTopColor: colors.separator }]}>
        {content?.shareable ? (
          <Button title="Share image" icon="share" onPress={share} loading={busy} />
        ) : (
          <Text variant="subhead" tone="secondary" align="center">
            {content ? 'Earn this badge to share it.' : ' '}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', marginBottom: SPACE.lg },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: SPACE.lg },
  miniBadge: { alignItems: 'center', width: '18%', gap: 2 },
});
