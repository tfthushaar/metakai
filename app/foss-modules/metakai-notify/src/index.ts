import { NativeModule, requireNativeModule } from 'expo';

/** What the native side needs to schedule one notification. */
export interface NativeSchedule {
  id: string;
  channel: string;
  title: string;
  body: string;
  /** A metakai:// link, or an empty string. */
  url: string;
  sound: boolean;
  kind: 'at' | 'daily' | 'weekly';
  /** Epoch milliseconds, for 'at'. */
  at: number;
  hour: number;
  minute: number;
  /** 1 is Sunday. */
  weekday: number;
}

declare class MetakaiNotifyModule extends NativeModule {
  areEnabled(): Promise<boolean>;
  schedule(spec: NativeSchedule): Promise<void>;
  cancel(id: string): Promise<void>;
  cancelAll(): Promise<void>;
}

/** Local notifications from Android's alarm clock, with no Firebase or Google Play services. */
export default requireNativeModule<MetakaiNotifyModule>('MetakaiNotify');
