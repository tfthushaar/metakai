export type BindValue = string | number | null | boolean | Uint8Array;

/** The part of expo-sqlite's synchronous API the app uses, so the web build can supply its own engine. */
export interface Db {
  execSync(sql: string): void;
  runSync(sql: string, params?: BindValue[]): unknown;
  getAllSync<T>(sql: string, params?: BindValue[]): T[];
  getFirstSync<T>(sql: string, params?: BindValue[]): T | null;
  withTransactionSync(task: () => void): void;
}
