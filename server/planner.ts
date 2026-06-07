import { randomUUID } from "node:crypto";

/**
 * Deterministic planner: turns a natural-language goal into a fixed-role agent
 * team plus a scoped task board. This is the "mocked planner" the MVP ships
 * with; a real Claude/Codex planner adapter can replace generatePlan() later
 * while keeping the same output contract.
 */

const id = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();

function subjectOf(goal: string): string {
  const cleaned = goal.trim().replace(/[.!?]+$/, "");
  // Drop a leading imperative verb so titles read naturally.
  const withoutVerb = cleaned.replace(
    /^(add|build|create|implement|make|set up|setup|enable|integrate)\s+/i,
    "",
  );
  return (withoutVerb || cleaned).toLowerCase();
}

export interface PlanAgent {
  id: string;
  name: string;
  role: "planner" | "coder" | "reviewer" | "tester";
  status: "idle" | "planning" | "running" | "reviewing" | "blocked" | "done";
  responsibility: string;
  currentTaskId?: string;
  lastUpdate: string;
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  ownerRole: "planner" | "coder" | "reviewer" | "tester";
  status: "backlog" | "ready" | "running" | "review" | "done";
  fileScope: string[];
  risk: "low" | "medium" | "high";
  dependencies: string[];
}

export interface GeneratedPlan {
  agents: PlanAgent[];
  tasks: PlanTask[];
  planSummary: string;
}

export function generatePlan(goal: string): GeneratedPlan {
  const subject = subjectOf(goal);
  // Per-plan tag keeps agent ids unique so multiple runs coexist in one DB.
  const tag = randomUUID().slice(0, 6);

  const planner: PlanAgent = {
    id: `agent-planner-${tag}`,
    name: "Planner",
    role: "planner",
    status: "done",
    responsibility: "Turns the goal into scoped tasks and dependencies.",
    lastUpdate: "Plan ready for approval",
  };
  const coder: PlanAgent = {
    id: `agent-coder-${tag}`,
    name: "Coder",
    role: "coder",
    status: "idle",
    responsibility: "Implements approved tasks and reports file changes.",
    lastUpdate: "Waiting for plan approval",
  };
  const reviewer: PlanAgent = {
    id: `agent-reviewer-${tag}`,
    name: "Reviewer",
    role: "reviewer",
    status: "idle",
    responsibility: "Checks implementation risks and creates follow-ups.",
    lastUpdate: "Standing by",
  };
  const tester: PlanAgent = {
    id: `agent-tester-${tag}`,
    name: "Tester",
    role: "tester",
    status: "idle",
    responsibility: "Runs validation and summarizes test confidence.",
    lastUpdate: "Standing by",
  };

  const audit: PlanTask = {
    id: id("task"),
    title: "Audit current structure",
    description: `Map the existing code paths and assumptions relevant to "${subject}".`,
    ownerRole: "coder",
    status: "ready",
    fileScope: ["src/**", "README.md"],
    risk: "low",
    dependencies: [],
  };
  const implement: PlanTask = {
    id: id("task"),
    title: `Implement ${subject}`,
    description: `Build the core change for the goal: ${goal.trim()}`,
    ownerRole: "coder",
    status: "backlog",
    fileScope: ["src/**"],
    risk: "high",
    dependencies: [audit.id],
  };
  const ui: PlanTask = {
    id: id("task"),
    title: "Build entry point / UI",
    description: `Add the user-facing entry point and states for ${subject}.`,
    ownerRole: "coder",
    status: "backlog",
    fileScope: ["src/components/**", "src/App.tsx"],
    risk: "medium",
    dependencies: [implement.id],
  };
  const integrate: PlanTask = {
    id: id("task"),
    title: "Integrate and guard edges",
    description: `Wire the change end to end and protect error and boundary cases for ${subject}.`,
    ownerRole: "reviewer",
    status: "backlog",
    fileScope: ["src/**"],
    risk: "high",
    dependencies: [implement.id],
  };
  const tests: PlanTask = {
    id: id("task"),
    title: "Add tests",
    description: `Cover the main flow and one failure path for ${subject}.`,
    ownerRole: "tester",
    status: "backlog",
    fileScope: ["tests/**"],
    risk: "medium",
    dependencies: [integrate.id],
  };
  const envReview: PlanTask = {
    id: id("task"),
    title: "Review config and docs",
    description: "Confirm required configuration, env vars, and documentation updates.",
    ownerRole: "planner",
    status: "ready",
    fileScope: [".env.example", "README.md"],
    risk: "medium",
    dependencies: [implement.id],
  };

  const tasks = [audit, implement, ui, integrate, tests, envReview];

  return {
    agents: [planner, coder, reviewer, tester],
    tasks,
    planSummary: `Plan proposed: ${tasks.length} tasks. Audit first, then implement "${subject}", build the entry point, integrate, test, and review config.`,
  };
}

export { now, id };
