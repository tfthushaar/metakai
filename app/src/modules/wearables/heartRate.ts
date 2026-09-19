import { PermissionsAndroid, Platform } from 'react-native';
import type { BleManager, Subscription } from 'react-native-ble-plx';
import { create } from 'zustand';

import { useSettings } from '../../core/store/settings';
import { base64Bytes, heartRateStats, parseHeartRate } from '../../lib/wearables';

/**
 * Live heart rate over Bluetooth from any sensor using the standard Heart Rate profile:
 * watches that broadcast heart rate (Garmin, Polar, COROS, Suunto, Amazfit) and chest straps.
 */

const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';
const SCAN_MS = 20_000;
const RETRY_MS = 4_000;
const MAX_RETRIES = 30;

export type HeartRateStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'reconnecting';

interface HeartRateState {
  status: HeartRateStatus;
  bpm: number | null;
  /** Sensors seen during a scan. */
  found: { id: string; name: string }[];
  error: string | null;
}

export const useHeartRate = create<HeartRateState>(() => ({ status: 'idle', bpm: null, found: [], error: null }));

let manager: BleManager | null = null;
function ble(): BleManager {
  if (!manager) {
    const { BleManager: Manager } = require('react-native-ble-plx') as typeof import('react-native-ble-plx');
    manager = new Manager();
  }
  return manager;
}

let scanTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retries = 0;
let subs: Subscription[] = [];
/** Samples for the workout or recording in progress. */
let session: { key: string; samples: number[] } | null = null;

const set = (patch: Partial<HeartRateState>) => useHeartRate.setState(patch);

async function hasPermission(ask: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const wanted =
    Number(Platform.Version) >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const granted = await Promise.all(wanted.map((p) => PermissionsAndroid.check(p)));
  if (granted.every(Boolean)) return true;
  if (!ask) return false;
  const result = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}

async function bluetoothOn(): Promise<boolean> {
  return (await ble().state()) === 'PoweredOn';
}

export async function scanForSensors() {
  if (!(await hasPermission(true))) return set({ error: 'Allow Nearby devices to find your watch or strap.' });
  if (!(await bluetoothOn())) return set({ error: 'Turn on Bluetooth, then try again.' });
  stopScan();
  set({ status: 'scanning', found: [], error: null });
  ble().startDeviceScan([HR_SERVICE], { allowDuplicates: false }, (error, device) => {
    if (error) {
      stopScan();
      set({ error: error.message });
      return;
    }
    if (!device) return;
    const name = device.name ?? device.localName ?? 'Heart rate sensor';
    const { found } = useHeartRate.getState();
    if (!found.some((f) => f.id === device.id)) set({ found: [...found, { id: device.id, name }] });
  });
  scanTimer = setTimeout(stopScan, SCAN_MS);
}

export function stopScan() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = null;
  if (manager) ble().stopDeviceScan();
  if (useHeartRate.getState().status === 'scanning') set({ status: 'idle' });
}

function clearSubs() {
  subs.forEach((s) => s.remove());
  subs = [];
}

export async function connectSensor(id: string, name: string, remember = true) {
  stopScan();
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  set({ status: useHeartRate.getState().status === 'reconnecting' ? 'reconnecting' : 'connecting', error: null });
  try {
    const device = await ble().connectToDevice(id, { timeout: 15_000 });
    await device.discoverAllServicesAndCharacteristics();
    clearSubs();
    subs.push(
      device.monitorCharacteristicForService(HR_SERVICE, HR_MEASUREMENT, (err, characteristic) => {
        if (err || !characteristic?.value) return;
        const bpm = parseHeartRate(base64Bytes(characteristic.value));
        if (bpm == null) return;
        set({ bpm });
        session?.samples.push(bpm);
      }),
      ble().onDeviceDisconnected(id, () => {
        clearSubs();
        set({ bpm: null });
        // Keep trying while a workout or recording still wants heart rate.
        if (session) scheduleRetry(id, name);
        else set({ status: 'idle' });
      }),
    );
    retries = 0;
    set({ status: 'connected' });
    if (remember) {
      const s = useSettings.getState();
      s.set({ watch: { ...s.watch, hrDevice: { id, name } } });
    }
  } catch (e) {
    if (session) scheduleRetry(id, name);
    else set({ status: 'idle', error: e instanceof Error ? `Couldn't connect: ${e.message}` : "Couldn't connect" });
  }
}

function scheduleRetry(id: string, name: string) {
  if (retries >= MAX_RETRIES) return set({ status: 'idle' });
  retries++;
  set({ status: 'reconnecting' });
  retryTimer = setTimeout(() => connectSensor(id, name, false), RETRY_MS);
}

export async function disconnectSensor(forget: boolean) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  clearSubs();
  const saved = useSettings.getState().watch.hrDevice;
  if (saved && manager) await ble().cancelDeviceConnection(saved.id).catch(() => {});
  set({ status: 'idle', bpm: null });
  if (forget) {
    const s = useSettings.getState();
    s.set({ watch: { ...s.watch, hrDevice: null } });
  }
}

/**
 * Starts collecting heart rate for a workout or recording and connects to the saved sensor.
 * Calling it again with the same key keeps the samples already collected.
 */
export async function startHeartRateSession(key: string) {
  const { watch, enabledModules } = useSettings.getState();
  if (!watch.hrDevice || !enabledModules.includes('wearables')) return;
  if (session?.key !== key) session = { key, samples: [] };
  const { status } = useHeartRate.getState();
  if (status === 'connected' || status === 'connecting' || status === 'reconnecting') return;
  if (!(await hasPermission(false)) || !(await bluetoothOn())) return;
  connectSensor(watch.hrDevice.id, watch.hrDevice.name, false);
}

/** Ends the session and returns its average and peak, then lets the sensor go. */
export function endHeartRateSession(key: string): { avg: number; max: number } | null {
  if (session?.key !== key) return null;
  const stats = heartRateStats(session.samples);
  session = null;
  disconnectSensor(false);
  return stats;
}
