import { NativeModule, requireNativeModule } from 'expo';

/** One GPS reading from the phone's location service. */
export interface NativeFix {
  lat: number;
  lon: number;
  alt: number | null;
  altAccuracy: number | null;
  accuracy: number | null;
  /** Epoch milliseconds. */
  t: number;
}

type Events = {
  onFixes(event: { fixes: NativeFix[] }): void;
  onWatch(event: { fix: NativeFix }): void;
};

declare class MetakaiLocationModule extends NativeModule<Events> {
  servicesEnabled(): Promise<boolean>;
  /** Starts live delivery (onFixes) and returns fixes kept while the app wasn't listening. */
  attach(): Promise<NativeFix[]>;
  start(title: string, body: string): Promise<void>;
  stop(): Promise<void>;
  startWatch(): Promise<void>;
  stopWatch(): Promise<void>;
}

/** GPS from Android's own location service, with no Google Play services. */
export default requireNativeModule<MetakaiLocationModule>('MetakaiLocation');
