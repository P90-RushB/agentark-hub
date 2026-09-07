import hfArtifacts from "../data/hfArtifacts.json";
import kaggleBench from "../data/kaggleBench.json";
import { stableSlug, withBase } from "./site.js";

const taskModules = import.meta.glob("../content/tasks/*.mdx", { eager: true });
const mdxEntries = Object.entries(taskModules).map(([path, module]) => ({
  slug: path.split("/").pop().replace(/\.mdx$/, ""),
  Content: module.default,
  data: module.frontmatter
}));
const mdxByTaskId = new Map(mdxEntries.map((entry) => [entry.data.taskId, entry]));
const kaggleTaskNames = new Set(
  kaggleBench.task_ids.map((value) => String(value).replace(/^agentark-/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase())
);

function humanizeTaskName(value) {
  return String(value)
    .replace(/^Task\d+[_-]?/, "")
    .replace(/PvZ/gi, "Pvz")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b3d\b/gi, "3D")
    .replace(/\b2d\b/gi, "2D")
    .replace(/\bPvz\b/g, "PvZ")
    .trim();
}

function inferredTags(task) {
  const id = Number(task.task_id);
  if (id >= 138 && id <= 165) return ["3d", "multimodal", "multi-view"];
  if (id >= 166 && id <= 182) return id === 174 ? ["code-mode", "multimodal"] : ["3d", "multimodal", "probuilder"];
  if (id === 198 || id === 212 || id === 213) return ["pure-text", "tables-data"];
  if (id >= 215 && id <= 220) return ["2d", "pure-text", "grid", "strategy", "pvz"];
  if ((id >= 183 && id <= 197) || (id >= 199 && id <= 214)) return ["2d", "multimodal", "charts-data"];
  return /3d/i.test(task.task_name) ? ["3d", "multimodal"] : ["2d", "multimodal"];
}

function normalizeTags(tags, dimension) {
  const aliases = {
    "image-obs": "multimodal",
    "text-obs": "pure-text",
    xcharts: "charts-data",
    chart: "charts-data",
    "physics-based": "physics"
  };
  const normalized = tags.map((tag) => aliases[tag] || tag).filter(Boolean);
  if (dimension === "2d" || dimension === "3d") normalized.unshift(dimension);
  return [...new Set(normalized.map((tag) => String(tag).toLowerCase()))];
}

function matchesKaggle(taskName, slug) {
  const compact = (value) => String(value).replace(/[^a-z0-9]/gi, "").toLowerCase();
  return [taskName, slug].some((value) => kaggleTaskNames.has(compact(value)));
}

export const taskEntries = Object.values(hfArtifacts.tasks)
  .map((artifact) => {
    const mdx = mdxByTaskId.get(artifact.task_name);
    const data = mdx?.data ?? {};
    const dimension = data.dimension ?? (inferredTags(artifact).includes("3d") ? "3d" : "2d");
    const slug = mdx?.slug ?? stableSlug(artifact.task_name);
    const tags = normalizeTags(data.tags ?? inferredTags(artifact), dimension);
    const title = data.title ?? humanizeTaskName(artifact.task_name);
    const summary = data.summary ?? "A published AgentArk task mod available from the public artifact registry.";
    const platforms = Object.values(artifact.platforms ?? {});
    return {
      slug,
      Content: mdx?.Content ?? null,
      artifact,
      data: {
        ...data,
        taskId: artifact.task_name,
        title,
        summary,
        dimension,
        tags,
        cover: data.cover ?? "",
        status: "published"
      },
      listItem: {
        slug,
        title,
        taskId: artifact.task_name,
        taskNumber: artifact.task_id,
        dimension,
        status: "published",
        summary,
        cover: data.cover ?? "",
        tags,
        platforms: platforms.map((platform) => platform.platform),
        onKaggleBench: matchesKaggle(artifact.task_name, slug)
      }
    };
  })
  .sort((a, b) => a.artifact.task_id - b.artifact.task_id);

export function getTaskBySlug(slug) {
  return taskEntries.find((entry) => entry.slug === slug);
}

export function hrefForTask(slug) {
  return withBase(`/tasks/${slug}/`);
}

export const hfDatasetUrl = hfArtifacts.dataset_url;
export const publishedTaskCount = taskEntries.length;
export const kaggleBenchUrl = kaggleBench.source_url;

export function downloadsForTask(taskId) {
  return Object.values(hfArtifacts.tasks[taskId]?.platforms ?? {});
}
