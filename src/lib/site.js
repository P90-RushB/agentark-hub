export const SITE_TITLE = "AgentArk Hub";
export const SITE_DESCRIPTION =
  "A task hub for evaluating multimodal agents that act by writing code into Unity environments.";

export function withBase(path = "/") {
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}` || "/";
}

export function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "N/A";
  }
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "N/A";
  }
  return `${Math.round(Number(value) * 100)}%`;
}

export function taskRankings(leaderboards, taskId) {
  return leaderboards.tasks.find((task) => task.task_id === taskId)?.leaderboard ?? [];
}

export function bestResult(leaderboards, taskId) {
  return taskRankings(leaderboards, taskId)[0] ?? null;
}
