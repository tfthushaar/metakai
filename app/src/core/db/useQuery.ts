import { useCallback, useEffect, useRef, useState } from 'react';

import { subscribe, type TableName } from './database';

/** Runs a synchronous query and re-runs it whenever one of `tables` changes. */
export function useQuery<T>(tables: TableName[], query: () => T, deps: unknown[] = []): T {
  const queryRef = useRef(query);
  queryRef.current = query;
  const [value, setValue] = useState<T>(() => query());
  const run = useCallback(() => setValue(queryRef.current()), []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => subscribe(tables, run), [tables.join(','), run]);

  return value;
}
