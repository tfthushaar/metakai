import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { sendMagicLink, sendPasswordReset, signInWithPassword, signUpWithPassword } from '../core/auth/auth';
import { SPACE } from '../core/theme/typography';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { toast } from '../ui/Toast';

type Mode = 'signin' | 'signup' | 'magic';

export default function EmailAuth() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const canSubmit = validEmail && (mode === 'magic' || password.length >= 8);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const submit = () =>
    run(async () => {
      const trimmed = email.trim();
      if (mode === 'signin') {
        await signInWithPassword(trimmed, password);
        leave();
      } else if (mode === 'signup') {
        const { needsConfirmation } = await signUpWithPassword(trimmed, password);
        if (needsConfirmation) setNotice(`We sent a confirmation link to ${trimmed}. Open it on this phone to finish.`);
        else leave();
      } else {
        await sendMagicLink(trimmed);
        setNotice(`Check ${trimmed} for a sign-in link. Open it on this phone.`);
      }
    });

  const reset = () =>
    run(async () => {
      await sendPasswordReset(email.trim());
      setNotice(`Password reset link sent to ${email.trim()}.`);
    });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title="Email" back>
        <View style={{ gap: SPACE.lg }}>
          <SegmentedControl<Mode>
            value={mode}
            onChange={(m) => {
              setMode(m);
              setNotice(null);
            }}
            segments={[
              { value: 'signin', label: 'Sign in' },
              { value: 'signup', label: 'Create account' },
              { value: 'magic', label: 'Magic link' },
            ]}
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          {mode !== 'magic' && (
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="At least 8 characters"
            />
          )}
          <Button
            title={mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send link'}
            onPress={submit}
            loading={loading}
            disabled={!canSubmit}
          />
          {mode === 'signin' && (
            <Button title="Forgot password?" variant="plain" size="md" onPress={reset} disabled={!validEmail || loading} />
          )}
          {notice && (
            <Text variant="subhead" tone="secondary" align="center">
              {notice}
            </Text>
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
