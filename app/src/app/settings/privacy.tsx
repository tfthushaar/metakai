import { useEffect, useState } from 'react';

import { authenticate, biometricsAvailable } from '../../core/AppLock';
import { useSettings } from '../../core/store/settings';
import { ListGroup, ListRow } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';
import { Toggle } from '../../ui/Toggle';

export default function Privacy() {
  const appLock = useSettings((s) => s.appLock);
  const set = useSettings((s) => s.set);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    biometricsAvailable().then(setAvailable);
  }, []);

  const toggle = async (on: boolean) => {
    // Confirm the user can unlock before turning the lock on, and before turning it off.
    if (await authenticate(on ? 'Confirm to turn on app lock' : 'Confirm to turn off app lock')) set({ appLock: on });
    else toast('Authentication cancelled');
  };

  return (
    <Screen title="Privacy" back>
      <ListGroup
        footer={
          available === false
            ? 'Set up a fingerprint, face unlock or screen lock on this phone to use app lock.'
            : 'Asks for your fingerprint or face when Metakai opens, and after 30 seconds in the background.'
        }
      >
        <ListRow title="App lock" icon="user" accessory={<Toggle value={appLock} onChange={toggle} disabled={!available} />} />
      </ListGroup>

      <ListGroup header="Your data">
        <ListRow title="Stored on this phone" subtitle="Food, weight, workouts, photos and measurements are saved locally first." />
        <ListRow title="Photos never leave the device" subtitle="Progress photos are kept inside the app, not in your gallery." />
        <ListRow title="AI requests" subtitle="Only the meal text you ask AI to analyze is sent, never your profile or weight." />
      </ListGroup>
      <Text variant="caption" tone="tertiary" style={{ marginTop: 16, paddingHorizontal: 16 }}>
        When you sign in, your logs sync to your private account, protected so only you can read them.
      </Text>
    </Screen>
  );
}
