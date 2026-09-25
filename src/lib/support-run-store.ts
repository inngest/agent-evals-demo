/**
 * In-memory record of the runs this server has triggered, shared by the
 * trigger and status routes. Pinned to globalThis so Next's per-route module
 * instances (and dev hot reloads) all see the same map.
 */
export type StoredSupportRun = {
  supportRunId: string;
  requestedAt: string;
  sent: boolean;
  inngestEventId?: string;
  inngestRunId?: string;
  error?: string;
};

const store = globalThis as typeof globalThis & {
  __supportRuns?: Map<string, StoredSupportRun>;
};

export const supportRunStore =
  store.__supportRuns ??
  (store.__supportRuns = new Map<string, StoredSupportRun>());
