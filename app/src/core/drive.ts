import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { File } from 'expo-file-system';
import { create } from 'zustand';

import { photoDirectory, restoreBackup, snapshotJson } from './backup';
import { clearGoogleToken, configureGoogle, googleError, googleTokens, signInWithGoogle, signOutGoogle } from './google';
import { getDb, notify, subscribe, SYNCED_TABLES } from './db/database';
import { DEFAULT_DRIVE, useSettings, type DriveSettings } from './store/settings';

/**
 * Optional backup to the user's own Google Drive. Data lives in the hidden app folder, which only
 * Metakai can see: one JSON file for the database plus one file per progress photo.
 * The phone stays the main copy; Drive is merged in (newest row wins) and then overwritten.
 */
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DATA_FILE = 'metakai-data.json';
const PHOTO_PREFIX = 'photo-';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
/** Wait for edits to settle before uploading. */
const DEBOUNCE_MS = 20_000;

export type DriveStatus = 'idle' | 'syncing' | 'error';
// Starts dirty so each launch uploads once, covering edits made just before the app was closed.
export const useDrive = create<{ status: DriveStatus; error: string | null; dirty: boolean }>(() => ({ status: 'idle', error: null, dirty: true }));

const driveSettings = () => useSettings.getState().drive;
const setDrive = (patch: Partial<DriveSettings>) => useSettings.getState().set({ drive: { ...driveSettings(), ...patch } });

const friendly = (e: unknown) => googleError(e, 'Google Drive backup');

/** Opens Google sign-in and asks for Drive app-folder access. Returns the email, or null if cancelled. */
export async function connectDrive(): Promise<string | null> {
  const user = await signInWithGoogle('Google Drive backup');
  if (!user) return null;
  try {
    if (!user.scopes.includes(SCOPE)) {
      const added = await GoogleSignin.addScopes({ scopes: [SCOPE] });
      if (!added || added.type !== 'success') return null;
    }
    return user.user.email;
  } catch (e) {
    throw new Error(friendly(e));
  }
}

export async function disconnectDrive() {
  // Leaderboards share the Google sign-in, so only sign out when nothing else needs it.
  if (!useSettings.getState().leaderboard.joined) await signOutGoogle();
  useSettings.getState().set({ drive: DEFAULT_DRIVE });
}

/* ---------------- REST helpers ---------------- */

let token: string | null = null;

async function accessToken(fresh = false): Promise<string> {
  configureGoogle();
  if (fresh && token) await clearGoogleToken(token);
  if (fresh || !token) {
    try {
      token = (await googleTokens()).accessToken;
    } catch {
      throw new Error('Sign in to Google again to keep backing up.');
    }
  }
  return token;
}

async function api(path: string, init: RequestInit = {}, base = API): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${base}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${await accessToken(attempt > 0)}` } });
    if (res.status === 401 && attempt === 0) continue;
    if (res.status === 403 || res.status === 429) {
      const body = await res.json().catch(() => null);
      throw new Error(/storageQuota/i.test(JSON.stringify(body)) ? 'Your Google Drive is full.' : 'Google Drive is busy. Will retry later.');
    }
    if (!res.ok && res.status !== 404) throw new Error(`Google Drive error ${res.status}.`);
    return res;
  }
  throw new Error('Google sign-in expired. Reconnect Drive in Settings.');
}

interface RemoteFile {
  id: string;
  name: string;
  modifiedTime: string;
}

async function listFiles(): Promise<RemoteFile[]> {
  const out: RemoteFile[] = [];
  let pageToken = '';
  do {
    const res = await api(`/files?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name,modifiedTime)${pageToken ? `&pageToken=${pageToken}` : ''}`);
    const data = await res.json();
    out.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

async function uploadJson(existing: RemoteFile | undefined, body: string): Promise<string> {
  if (existing) {
    const res = await api(`/files/${existing.id}?uploadType=media&fields=modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }, UPLOAD);
    return (await res.json()).modifiedTime;
  }
  const boundary = `metakai${Date.now()}`;
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: DATA_FILE, parents: ['appDataFolder'] })}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await api('/files?uploadType=multipart&fields=modifiedTime', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart }, UPLOAD);
  return (await res.json()).modifiedTime;
}

async function uploadPhoto(photoId: string, path: string) {
  const meta = await api('/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `${PHOTO_PREFIX}${photoId}.jpg`, parents: ['appDataFolder'] }),
  });
  const { id } = await meta.json();
  const result = await new File(path).upload(`${UPLOAD}/files/${id}?uploadType=media`, {
    httpMethod: 'PATCH',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'image/jpeg' },
  });
  if (result.status >= 300) {
    await api(`/files/${id}`, { method: 'DELETE' }).catch(() => {});
    throw new Error('Photo upload failed.');
  }
}

async function downloadPhoto(file: RemoteFile, photoId: string): Promise<string> {
  const dest = new File(photoDirectory(), `${photoId}.jpg`);
  const saved = await File.downloadFileAsync(`${API}/files/${file.id}?alt=media`, dest, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
    idempotent: true,
  });
  return saved.uri;
}

/* ---------------- sync ---------------- */

async function runSync(): Promise<void> {
  const files = await listFiles();
  const dataFile = files.find((f) => f.name === DATA_FILE);

  // 1. Merge anything newer from Drive (another phone, or a reinstall).
  if (dataFile && dataFile.modifiedTime !== driveSettings().remoteVersion) {
    const res = await api(`/files/${dataFile.id}?alt=media`);
    await restoreBackup(await res.text(), { applySettings: false });
    useDrive.setState({ dirty: true });
  }

  // 2. Upload the merged database. Never replace a backup with an empty, not-yet-set-up phone.
  const hasProfile = getDb().getFirstSync('SELECT id FROM profile WHERE deleted_at IS NULL LIMIT 1') != null;
  if (!hasProfile) return;
  if (useDrive.getState().dirty || !dataFile) {
    useDrive.setState({ dirty: false });
    const version = await uploadJson(dataFile, snapshotJson());
    setDrive({ remoteVersion: version });
  } else if (dataFile) {
    setDrive({ remoteVersion: dataFile.modifiedTime });
  }

  // 3. Photos: upload new ones, fetch missing ones, remove deleted ones.
  const db = getDb();
  const remotePhotos = new Map(files.filter((f) => f.name.startsWith(PHOTO_PREFIX)).map((f) => [f.name.slice(PHOTO_PREFIX.length, -4), f]));
  const rows = db.getAllSync<{ id: string; local_path: string | null; deleted_at: string | null }>('SELECT id, local_path, deleted_at FROM progress_photos');
  let fetched = false;
  for (const row of rows) {
    const remote = remotePhotos.get(row.id);
    if (row.deleted_at) {
      if (remote) await api(`/files/${remote.id}`, { method: 'DELETE' });
      continue;
    }
    const hasLocal = row.local_path != null && new File(row.local_path).exists;
    if (hasLocal && !remote) await uploadPhoto(row.id, row.local_path!);
    else if (!hasLocal && remote) {
      const uri = await downloadPhoto(remote, row.id);
      // A device-specific path; not a user edit, so updated_at stays put.
      db.runSync('UPDATE progress_photos SET local_path = ? WHERE id = ?', [uri, row.id]);
      fetched = true;
    }
  }
  if (fetched) notify('progress_photos');
  setDrive({ lastSyncedAt: new Date().toISOString() });
}

let running: Promise<void> | null = null;

/** Merge with Drive and upload. Concurrent calls share one run. */
export function syncDrive(): Promise<void> {
  if (!driveSettings().enabled) return Promise.resolve();
  if (!running) {
    useDrive.setState({ status: 'syncing', error: null });
    running = runSync()
      .then(() => useDrive.setState({ status: 'idle', error: null }))
      .catch((e) => useDrive.setState({ status: 'error', error: friendly(e) }))
      .finally(() => {
        running = null;
      });
  }
  return running;
}

/** Downloads the Drive backup onto a fresh phone. Returns false when Drive has no backup. */
export async function restoreFromDrive(): Promise<boolean> {
  const files = await listFiles();
  const dataFile = files.find((f) => f.name === DATA_FILE);
  if (!dataFile) return false;
  const res = await api(`/files/${dataFile.id}?alt=media`);
  await restoreBackup(await res.text(), { applySettings: true });
  setDrive({ enabled: true, remoteVersion: dataFile.modifiedTime, lastSyncedAt: new Date().toISOString() });
  // Photos come down in the background.
  syncDrive();
  return true;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Marks data as changed and schedules an upload once edits settle. Returns an unsubscribe function. */
export function watchForChanges(): () => void {
  return subscribe(SYNCED_TABLES, () => {
    useDrive.setState({ dirty: true });
    if (!driveSettings().enabled) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      syncDrive();
    }, DEBOUNCE_MS);
  });
}

/** Upload straight away, for when the app goes to the background. */
export function flushDrive() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (useDrive.getState().dirty) syncDrive();
}
