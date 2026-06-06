import { createRun, getLatestRunId } from "./store.ts";

/**
 * Seed a demo run if the database is empty, matching the spec's Personal CRM
 * scenario. Safe to run repeatedly: it only seeds when no run exists.
 */
const existing = getLatestRunId();
if (existing) {
  console.log(`[seed] run already exists (${existing}); nothing to do.`);
} else {
  const runId = createRun({
    goal: "Add GitHub OAuth login and a protected dashboard.",
    projectName: "Personal CRM",
    workspaceName: "Solo Builder",
  });
  console.log(`[seed] created demo run ${runId}`);
}
