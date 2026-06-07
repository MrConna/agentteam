import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "./worktree.ts";
import type { RealRunResult, RealTaskPacket } from "./runArtifacts.ts";

/**
 * File-backed run artifacts under .agentteam/runs/<delegated-run-id>/, per
 * AGENTS.md "Delegated Work Standard". Real adapter evidence lives on disk, not
 * only inside a SQLite JSON column, so a human (or another agent) can inspect a
 * run without the app. The directory is gitignored (.agentteam/).
 */

export interface RunArtifactInput {
  delegatedRunId: string;
  packet: RealTaskPacket;
  result: RealRunResult;
  plan: string[];
  heartbeat: { status: string; progress: number; currentStep: string; updatedAt: string };
  memoryNote: string;
}

export function runArtifactDir(delegatedRunId: string): string {
  return join(PROJECT_ROOT, ".agentteam", "runs", delegatedRunId);
}

export function writeRunArtifacts(input: RunArtifactInput): { dir: string; files: string[] } {
  const dir = runArtifactDir(input.delegatedRunId);
  mkdirSync(dir, { recursive: true });

  const { packet, result } = input;
  const files: Record<string, string> = {
    "task.json": JSON.stringify(packet, null, 2),
    "result.json": JSON.stringify(result, null, 2),
    "heartbeat.json": JSON.stringify(input.heartbeat, null, 2),
    "plan.md": `# Plan: ${packet.title}\n\n${input.plan.map((p) => `- ${p}`).join("\n")}\n`,
    "progress.md": `# Progress\n\nStatus: ${result.status}\nStep: ${input.heartbeat.currentStep}\nUpdated: ${input.heartbeat.updatedAt}\n`,
    "evidence.md": evidenceMarkdown(input),
    "summary.md": `# Summary: ${packet.title}\n\n${result.summary}\n\nProvider: ${packet.provider} / ${packet.model}\nCommand: \`${result.command}\`\n`,
    "blockers.md": result.blockers.length
      ? `# Blockers\n\n${result.blockers.map((b) => `- ${b}`).join("\n")}\n`
      : "# Blockers\n\nNone.\n",
    "decisions.md": `# Decisions\n\n- Provider ${packet.provider} selected for role coder.\n- Model ${packet.model}.\n`,
  };

  const written: string[] = [];
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body, "utf8");
    written.push(name);
  }
  return { dir, files: written };
}

function evidenceMarkdown(input: RunArtifactInput): string {
  const { result } = input;
  const changed = result.changedFiles.length
    ? result.changedFiles.map((f) => `- ${f}`).join("\n")
    : "- (none)";
  const validation = result.validation
    .map((v) => `- ${v.command}: ${v.result} — ${v.summary}`)
    .join("\n");
  return [
    `# Evidence: ${input.packet.title}`,
    "",
    "## Memory applied",
    input.memoryNote,
    "",
    "## Changed files",
    changed,
    "",
    "## Validation",
    validation || "- (none)",
    "",
    "## stdout (tail)",
    "```",
    result.stdoutTail || "(empty)",
    "```",
    "",
    "## stderr (tail)",
    "```",
    result.stderrTail || "(empty)",
    "```",
    "",
  ].join("\n");
}
