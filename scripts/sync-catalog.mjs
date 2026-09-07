import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const HF_DATASET = "P90-RushB/AgentArk";
const HF_TREE_URL = `https://huggingface.co/api/datasets/${HF_DATASET}/tree/main?recursive=true&expand=false&limit=1000`;
const KAGGLE_URL = "https://www.kaggle.com/benchmarks/xunyiljg/agentark-bench";
const KAGGLE_API_URL = "https://www.kaggle.com/api/v1/benchmarks/xunyiljg/agentark-bench/leaderboard";
const root = resolve(import.meta.dirname, "..");

function versionParts(value) {
  return String(value)
    .replace(/^v/i, "")
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return String(left).localeCompare(String(right));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "agentark-hub-catalog-sync" }
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return { body: await response.json(), headers: response.headers };
}

async function listDatasetFiles() {
  const entries = [];
  let url = HF_TREE_URL;
  while (url) {
    const { body, headers } = await fetchJson(url);
    entries.push(...body);
    const link = headers.get("link") || "";
    const next = link.match(/<([^>]+)>; rel="next"/);
    url = next?.[1] || "";
  }
  return entries.filter((entry) => entry.type === "file" && entry.path.endsWith(".zip"));
}

function makeDownload(path, sizeBytes, platform) {
  return {
    label: platform === "windows" ? "Windows" : "Linux",
    platform,
    url: `https://huggingface.co/datasets/${HF_DATASET}/resolve/main/${path}`,
    path,
    size_bytes: sizeBytes ?? null,
    archive_format: "zip"
  };
}

function buildArtifacts(entries) {
  const byTask = new Map();
  const pattern = /^artifacts\/tasks\/\d{4}-\d{4}\/(\d{4})-(.+?)\/task-([^/]+)\/env-([^/]+)\/(windows|linux)\/[^/]+\.zip$/;

  for (const entry of entries) {
    const match = entry.path.match(pattern);
    if (!match) continue;
    const [, rawId, taskName, taskVersion, envVersion, platform] = match;
    const key = `${rawId}:${taskName}:${taskVersion}:${envVersion}`;
    const current = byTask.get(key) ?? {
      task_id: Number(rawId),
      task_name: taskName,
      task_version: taskVersion,
      env_version: envVersion,
      platforms: {}
    };
    current.platforms[platform] = makeDownload(entry.path, entry.size, platform);
    byTask.set(key, current);
  }

  const selected = new Map();
  for (const item of byTask.values()) {
    if (!item.platforms.windows && !item.platforms.linux) continue;
    const previous = selected.get(item.task_id);
    if (
      !previous ||
      compareVersions(item.env_version, previous.env_version) > 0 ||
      (compareVersions(item.env_version, previous.env_version) === 0 &&
        compareVersions(item.task_version, previous.task_version) > 0)
    ) {
      selected.set(item.task_id, item);
    }
  }

  const tasks = Object.fromEntries(
    [...selected.values()]
      .sort((a, b) => a.task_id - b.task_id)
      .map((item) => [item.task_name, item])
  );
  return {
    repo_id: HF_DATASET,
    dataset_url: `https://huggingface.co/datasets/${HF_DATASET}`,
    registry_created_at: new Date().toISOString(),
    current_release: "dynamic",
    tasks
  };
}

function numericResult(taskResult) {
  return taskResult?.result?.hasNumericResult
    ? taskResult.result.numericResult?.value ?? taskResult.result.numericResultNullable?.value
    : null;
}

function buildKaggleSnapshot(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const first = rows[0]?.taskResults ?? [];
  const taskIds = first
    .filter((item) => item.benchmarkTaskName !== "(Overall)")
    .map((item) => item.benchmarkTaskName);
  const leaderboard = rows
    .map((row) => {
      const overall = row.taskResults?.find((item) => item.benchmarkTaskName === "(Overall)");
      return {
        model: row.modelVersionName,
        score: numericResult(overall),
        evaluated_at: overall?.result?.evaluationDate ?? null
      };
    })
    .filter((row) => row.score !== null)
    .sort((a, b) => b.score - a.score);

  return {
    source_url: KAGGLE_URL,
    fetched_at: new Date().toISOString(),
    task_count: taskIds.length,
    model_count: leaderboard.length,
    task_ids: taskIds,
    leaderboard
  };
}

async function writeJson(relativePath, value) {
  const path = resolve(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const [datasetEntries, kaggleResponse] = await Promise.all([listDatasetFiles(), fetchJson(KAGGLE_API_URL)]);
const artifacts = buildArtifacts(datasetEntries);
const kaggle = buildKaggleSnapshot(kaggleResponse.body);
await Promise.all([
  writeJson("src/data/hfArtifacts.json", artifacts),
  writeJson("src/data/kaggleBench.json", kaggle)
]);
console.log(`Synced ${Object.keys(artifacts.tasks).length} published AgentArk task mods and ${kaggle.model_count} Kaggle models.`);
