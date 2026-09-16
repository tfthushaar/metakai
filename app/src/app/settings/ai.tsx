import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { setAiKey, testAiKey, useAiKeys, type AiProvider } from '../../core/aiKey';
import { useTheme } from '../../core/theme/ThemeProvider';
import { SPACE } from '../../core/theme/typography';
import { aiAllowanceToday } from '../../modules/food/aiRouter';
import { Button } from '../../ui/Button';
import { ListGroup, ListRow } from '../../ui/List';
import { ProgressBar } from '../../ui/ProgressBar';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { TextField } from '../../ui/TextField';
import { toast } from '../../ui/Toast';

const PROVIDERS: { id: AiProvider; name: string; placeholder: string; url: string; how: string; pattern: RegExp }[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    placeholder: 'AIza…',
    url: 'https://aistudio.google.com/apikey',
    how: 'Tap Get a key, sign in with Google, tap “Create API key” and copy it. Metakai pastes it when you come back.',
    pattern: /^AIza[\w-]{30,}$/,
  },
  {
    id: 'groq',
    name: 'Groq',
    placeholder: 'gsk_…',
    url: 'https://console.groq.com/keys',
    how: 'Tap Get a key, sign in, tap “Create API Key” and copy it. Metakai pastes it when you come back.',
    pattern: /^gsk_\w{20,}$/,
  },
];

const masked = (key: string) => `${key.slice(0, 4)}••••••••${key.slice(-4)}`;

function KeyCard({ provider }: { provider: (typeof PROVIDERS)[number] }) {
  const saved = useAiKeys((s) => s[provider.id]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await testAiKey(provider.id, draft);
      await setAiKey(provider.id, draft);
      setDraft('');
      toast(`${provider.name} key saved`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not check the key.');
    } finally {
      setBusy(false);
    }
  };

  /** Opens the provider's key page in an in-app browser, then picks up a copied key. */
  const getKey = async () => {
    await WebBrowser.openBrowserAsync(provider.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET, toolbarColor: '#000000' }).catch(() => {});
    const copied = (await Clipboard.getStringAsync().catch(() => '')).trim();
    if (provider.pattern.test(copied)) {
      setDraft(copied);
      toast('Key pasted from clipboard. Tap Save.');
    }
  };

  const paste = async () => {
    const copied = (await Clipboard.getStringAsync().catch(() => '')).trim();
    if (copied) setDraft(copied);
    else toast('Clipboard is empty');
  };

  const remove = () =>
    Alert.alert(`Remove ${provider.name} key?`, 'You can add it again at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setAiKey(provider.id, null) },
    ]);

  if (saved) {
    return (
      <ListGroup header={provider.name}>
        <ListRow icon="sparkles" title="Key saved" subtitle={masked(saved)} />
        <ListRow title="Remove key" destructive onPress={remove} chevron={false} />
      </ListGroup>
    );
  }
  return (
    <ListGroup header={provider.name} footer={`Free. ${provider.how}`}>
      <View style={{ padding: SPACE.lg, gap: SPACE.md }}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          placeholder={provider.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          secureTextEntry
        />
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <View style={{ flex: 1 }}>
            <Button title={draft ? 'Paste again' : 'Get a key'} variant="gray" size="sm" onPress={draft ? paste : getKey} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Save" size="sm" onPress={save} loading={busy} disabled={draft.trim().length < 20} />
          </View>
        </View>
      </View>
    </ListGroup>
  );
}

export default function AiSettings() {
  const { colors } = useTheme();
  const keys = useAiKeys();
  const allowance = aiAllowanceToday();
  const used = allowance.reduce((a, r) => a + r.used, 0);
  const limit = allowance.reduce((a, r) => a + r.limit, 0);

  return (
    <Screen title="AI" back>
      <Text variant="subhead" tone="secondary">
        AI reads meals the offline database doesn’t know. Metakai uses your own free keys and spreads requests across several models, so you rarely hit a
        limit. Adding both keys gives the most room.
      </Text>

      {limit > 0 && (
        <View style={{ marginTop: SPACE.xl, gap: SPACE.sm, paddingHorizontal: SPACE.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="footnote" tone="secondary">
              Used today
            </Text>
            <Text variant="footnote" tone="secondary" tabular>{`${used} of about ${limit.toLocaleString('en-US')}`}</Text>
          </View>
          <ProgressBar progress={limit ? used / limit : 0} color={colors.accent} />
        </View>
      )}

      {PROVIDERS.map((p) => (
        <KeyCard key={p.id} provider={p} />
      ))}

      <Text variant="caption" tone="tertiary" style={{ paddingHorizontal: SPACE.lg, marginTop: SPACE.lg }}>
        {keys.gemini || keys.groq ? 'Answers are cached, so re-checking the same meal is free. ' : ''}
        Keys stay in this phone’s secure storage and are never included in backups. Only the meal text you ask AI to analyze is sent, never your profile or
        weight.
      </Text>
    </Screen>
  );
}
