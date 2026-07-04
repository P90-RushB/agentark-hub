import leaderboards from "../data/leaderboards.json";
import hfArtifacts from "../data/hfArtifacts.json";
import { bestResult, formatModelName, formatScore, withBase } from "./site.js";

const taskModules = import.meta.glob("../content/tasks/*.mdx", { eager: true });

export const taskEntries = Object.entries(taskModules)
  .map(([path, module]) => {
    const slug = path.split("/").pop().replace(/\.mdx$/, "");
    const data = module.frontmatter;
    const best = bestResult(leaderboards, data.taskId);
    return {
      slug,
      Content: module.default,
      data,
      listItem: {
        slug,
        title: data.title,
        taskId: data.taskId,
        dimension: data.dimension,
        status: data.status,
        summary: data.summary,
        cover: data.cover,
        hasLeaderboard: Boolean(best),
        bestModel: best ? formatModelName(best.model_name) : "",
        bestScore: best ? formatScore(best.score_mean) : ""
      }
    };
  })
  .sort((a, b) => Number(a.data.order) - Number(b.data.order));

export function getTaskBySlug(slug) {
  return taskEntries.find((entry) => entry.slug === slug);
}

export function hrefForTask(slug) {
  return withBase(`/tasks/${slug}/`);
}

export const hfDatasetUrl = hfArtifacts.dataset_url;

export function downloadsForTask(taskId) {
  const platforms = hfArtifacts.tasks?.[taskId]?.platforms ?? {};
  return ["windows", "linux"].map((platform) => platforms[platform]).filter(Boolean);
}
