export type DemoFlags = {
  llmOffline: boolean;
  failureCount: number;
  latencyMs: number;
};

export const defaultDemoFlags: DemoFlags = {
  llmOffline: false,
  failureCount: 1,
  latencyMs: 0,
};

export function normalizeDemoFlags(flags?: Partial<DemoFlags>): DemoFlags {
  return {
    llmOffline: Boolean(flags?.llmOffline),
    failureCount: Math.max(0, Math.min(4, Number(flags?.failureCount ?? 1))),
    latencyMs: Math.max(0, Math.min(1800, Number(flags?.latencyMs ?? 0))),
  };
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
