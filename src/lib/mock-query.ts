import { mockUsers } from "@/content/seed-data";
import { wait } from "@/lib/demo-flags";

export async function runMockQuery(_sql: string, latencyMs = 0) {
  await wait(100 + Math.max(0, latencyMs));
  return mockUsers;
}
