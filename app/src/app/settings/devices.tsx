import { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { useSettings, type WatchData } from '../../core/store/settings';
import { SPACE } from '../../core/theme/typography';
import { connectSensor, disconnectSensor, scanForSensors, stopScan, useHeartRate } from '../../modules/wearables/heartRate';
import { healthSource, syncWatch, useWatchSync } from '../../modules/wearables/sync';
import type { HealthStatus } from '../../modules/wearables/types';
import { Button } from '../../ui/Button';
import { ListGroup, ListRow } from '../../ui/List';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { toast } from '../../ui/Toast';
import { Toggle } from '../../ui/Toggle';

const WORKS_WITH =
  Platform.OS === 'ios'
    ? 'Apple Watch, plus Garmin, Oura, Withings, Polar, COROS and other apps that write to Apple Health.'
    : 'Samsung Galaxy Watch, Pixel Watch, Fitbit, Garmin, Withings, Oura, Polar, Amazfit (Zepp) and Xiaomi, through their apps.';

const DATA: { id: WatchData; title: string; subtitle: string }[] = [
  { id: 'activity', title: 'Steps', subtitle: 'Daily total' },
  { id: 'heart', title: 'Heart', subtitle: 'Resting heart rate and HRV' },
  { id: 'sleep', title: 'Sleep', subtitle: 'Fills in your readiness check-in' },
  { id: 'body', title: 'Weigh-ins', subtitle: 'Weight and body fat from a smart scale' },
  { id: 'workouts', title: 'Workouts', subtitle: 'Runs, rides, walks, swims and other cardio' },
];

const when = (iso: string) => new Date(iso).toLocaleString([], { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });

export default function Devices() {
  const watch = useSettings((s) => s.watch);
  const set = useSettings((s) => s.set);
  const sync = useWatchSync();
  const hr = useHeartRate();
  const source = healthSource();
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    source
      ?.status()
      .then(setStatus)
      .catch(() => setStatus('unsupported'));
    return () => stopScan();
  }, [source]);

  const update = (patch: Partial<typeof watch>) => set({ watch: { ...useSettings.getState().watch, ...patch } });

  const connect = async () => {
    if (!source) return;
    setConnecting(true);
    try {
      if (!(await source.connect(watch.share))) {
        if (status === 'available') toast('No access was given. You can change this any time.');
        return;
      }
      update({ health: true });
      const result = await syncWatch();
      toast(result ? `Synced ${result.days} days${result.workouts ? `, ${result.workouts} workouts` : ''}` : (useWatchSync.getState().error ?? 'Connected'));
    } catch (e) {
      toast(e instanceof Error ? e.message : `Couldn't connect to ${source.name}.`);
    } finally {
      setConnecting(false);
    }
  };

  const setShare = async (on: boolean) => {
    if (on && source && !(await source.connect(true).catch(() => false))) return;
    update({ share: on });
    if (on) syncWatch();
  };

  const stop = () =>
    Alert.alert(`Stop syncing with ${source?.name}?`, 'Everything already brought in stays in Metakai.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: () => update({ health: false }) },
    ]);

  const syncText = sync.syncing
    ? 'Syncing…'
    : sync.error
      ? sync.error
      : watch.lastSyncedAt
        ? `Last synced ${when(watch.lastSyncedAt)}`
        : 'Not synced yet';

  const hrText =
    hr.status === 'connected'
      ? hr.bpm
        ? `Connected · ${hr.bpm} bpm`
        : 'Connected'
      : hr.status === 'connecting'
        ? 'Connecting…'
        : hr.status === 'reconnecting'
          ? 'Reconnecting…'
          : 'Connects when you start a workout or a recording';

  return (
    <Screen title="Watches" back>
      <Text variant="subhead" tone="secondary">
        Bring in steps, sleep, heart rate, weigh-ins and workouts from your watch or scale, and see live heart rate while you train.
      </Text>

      {source && status !== 'unsupported' && (
        <>
          {watch.health ? (
            <ListGroup header={source.name} footer={`Works with ${WORKS_WITH}`}>
              <ListRow icon="refresh" title="Sync now" subtitle={syncText ?? undefined} onPress={sync.syncing ? undefined : () => syncWatch()} chevron={false} />
              <ListRow icon="settings" title="Manage access" subtitle={`Choose what Metakai can read in ${source.name}`} onPress={() => source.openSettings()} />
            </ListGroup>
          ) : (
            <View style={{ gap: SPACE.sm, marginTop: SPACE.xl }}>
              <Button
                title={status === 'needs_install' ? 'Get Health Connect' : status === 'needs_update' ? 'Update Health Connect' : `Connect ${source.name}`}
                icon="watch"
                onPress={connect}
                loading={connecting}
              />
              <Text variant="caption" tone="tertiary" align="center">
                {`Works with ${WORKS_WITH}`}
              </Text>
            </View>
          )}

          {watch.health && (
            <>
              <ListGroup header="Bring in">
                {DATA.map((d) => (
                  <ListRow
                    key={d.id}
                    title={d.title}
                    subtitle={d.subtitle}
                    accessory={<Toggle value={watch.data[d.id]} onChange={(on) => update({ data: { ...watch.data, [d.id]: on } })} />}
                  />
                ))}
              </ListGroup>
              <ListGroup footer={`Workouts, runs and weigh-ins you log in Metakai show up in ${source.name} and the apps that read from it.`}>
                <ListRow title={`Send to ${source.name}`} accessory={<Toggle value={watch.share} onChange={setShare} />} />
              </ListGroup>
              <ListGroup>
                <ListRow title="Stop syncing" destructive onPress={stop} chevron={false} />
              </ListGroup>
            </>
          )}
        </>
      )}

      <ListGroup
        header="Live heart rate"
        footer="For watches that broadcast heart rate (Garmin, Polar, COROS, Suunto, Amazfit) and chest straps. Shows during workouts and recordings, and saves your average and peak."
      >
        {watch.hrDevice ? (
          <>
            <ListRow icon="heartPulse" title={watch.hrDevice.name} subtitle={hrText} />
            {hr.status !== 'connected' && (
              <ListRow icon="bluetooth" title="Test connection" onPress={() => connectSensor(watch.hrDevice!.id, watch.hrDevice!.name)} chevron={false} />
            )}
            <ListRow title="Forget this sensor" destructive onPress={() => disconnectSensor(true)} chevron={false} />
          </>
        ) : (
          <>
            <ListRow
              icon="bluetooth"
              title={hr.status === 'scanning' ? 'Looking for sensors…' : 'Find a heart rate sensor'}
              subtitle={hr.error ?? (hr.status === 'scanning' ? 'Turn on heart rate broadcast on your watch' : undefined)}
              onPress={hr.status === 'scanning' ? stopScan : scanForSensors}
              chevron={false}
            />
            {hr.found.map((d) => (
              <ListRow key={d.id} icon="heartPulse" title={d.name} subtitle="Tap to pair" onPress={() => connectSensor(d.id, d.name)} chevron={false} />
            ))}
          </>
        )}
      </ListGroup>
    </Screen>
  );
}
