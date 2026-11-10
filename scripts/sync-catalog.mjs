import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const HF_DATASET = "P90-RushB/AgentArk";
const HF_DATASET_URL = `https://huggingface.co/datasets/${HF_DATASET}`;
const HF_DATASET_API = `https://huggingface.co/api/datasets/${HF_DATASET}`;
const KAGGLE_URL = "https://www.kaggle.com/benchmarks/xunyiljg/agentark-bench";
const KAGGLE_API_URL = "https://www.kaggle.com/api/v1/benchmarks/xunyiljg/agentark-bench/leaderboard";
const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const revisionIndex = args.indexOf("--revision");
const requestedRevision = revisionIndex >= 0 ? args[revisionIndex + 1] : process.env.AGENTARK_HF_REVISION;
const catalogOnly = args.includes("--catalog-only");
const outputIndex = args.indexOf("--catalog-output");
const catalogOutput = outputIndex >= 0 ? args[outputIndex + 1] : "src/data/hfArtifacts.json";
if (revisionIndex >= 0 && (!requestedRevision || requestedRevision.startsWith("--"))) {
  throw new Error("--revision requires an immutable Hugging Face commit SHA.");
}
if (requestedRevision && !/^[0-9a-f]{40}$/i.test(requestedRevision)) {
  throw new Error("The Hugging Face revision must be a full immutable commit SHA.");
}
if (outputIndex >= 0 && (!catalogOnly || !catalogOutput || catalogOutput.startsWith("--"))) {
  throw new Error("--catalog-output requires --catalog-only and an output file path.");
}

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

async function fetchResponse(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "agentark-hub-catalog-sync" }
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return response;
}

async function fetchJson(url) {
  const response = await fetchResponse(url);
  return { body: await response.json(), headers: response.headers };
}

async function fetchPinnedFile(revision, path) {
  const url = artifactUrl(revision, path);
  const response = await fetchResponse(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { url, text: bytes.toString("utf8"), sha256: createHash("sha256").update(bytes).digest("hex") };
}

function artifactUrl(revision, path) {
  return `${HF_DATASET_URL}/resolve/${revision}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function isArtifactPath(path) {
  return typeof path === "string" && path.startsWith("artifacts/tasks/") && path.endsWith(".zip") &&
    !path.split("/").some((part) => !part || part === "." || part === ".." || part.includes("\\"));
}

async function readTaskRegistry() {
  const dataset = requestedRevision ? { sha: requestedRevision } : (await fetchJson(HF_DATASET_API)).body;
  const revision = requestedRevision || dataset.sha;
  if (!/^[0-9a-f]{40}$/i.test(revision || "")) throw new Error("Dataset API returned no immutable commit SHA.");
  const manifestFile = await fetchPinnedFile(revision, "manifest.json");
  const manifest = JSON.parse(manifestFile.text);
  const registryPath = manifest.registry?.tasks;
  if (typeof registryPath !== "string" || !registryPath.startsWith("registry/") ||
      registryPath.split("/").some((part) => !part || part === "." || part === ".." || part.includes("\\"))) {
    throw new Error("Manifest has no safe canonical task registry path.");
  }
  const registryFile = await fetchPinnedFile(revision, registryPath);
  const rows = registryFile.text.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid task registry JSON on line ${index + 1}.`); }
  });
  if (!rows.length) throw new Error("Canonical task registry is empty; refusing to replace the catalog.");
  return { manifest, manifestSha256: manifestFile.sha256, revision, registryPath, registryFile, rows, lastModified: dataset.lastModified };
}

function makeDownload(row, revision) {
  return {
    label: row.platform === "windows" ? "Windows" : "Linux",
    platform: row.platform,
    url: artifactUrl(revision, row.path),
    path: row.path,
    size_bytes: row.size_bytes,
    sha256: row.sha256,
    archive_format: row.archive_format || "zip"
  };
}

function buildArtifacts(registry) {
  const byTask = new Map();
  for (const row of registry.rows) {
    if (row.kind !== "task" || !["windows", "linux"].includes(row.platform)) continue;
    if (row.repo_id !== HF_DATASET || !Number.isInteger(row.task_id) || row.task_id < 0 ||
        typeof row.task_name !== "string" || !row.task_name.trim() ||
        typeof row.task_version !== "string" || !row.task_version ||
        typeof row.env_version !== "string" || !row.env_version || !isArtifactPath(row.path) ||
        !Number.isSafeInteger(row.size_bytes) || row.size_bytes <= 0 ||
        !/^[0-9a-f]{64}$/i.test(row.sha256 || "") ||
        (row.archive_format && row.archive_format !== "zip")) {
      throw new Error(`Invalid canonical task artifact metadata: ${row.path || row.task_name || "unknown"}`);
    }
    const key = JSON.stringify([row.task_id, row.task_name, row.task_version, row.env_version]);
    const current = byTask.get(key) ?? {
      task_id: row.task_id,
      task_name: row.task_name,
      task_version: row.task_version,
      env_version: row.env_version,
      platforms: {}
    };
    const existing = current.platforms[row.platform];
    if (existing && (existing.path !== row.path || existing.sha256 !== row.sha256)) {
      throw new Error(`Conflicting task registry artifacts for task ${row.task_id} on ${row.platform}.`);
    }
    current.platforms[row.platform] = makeDownload(row, registry.revision);
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

  const items = [...selected.values()].sort((a, b) => a.task_id - b.task_id);
  if (!items.length) throw new Error("No published task artifacts found in the canonical registry.");
  if (new Set(items.map((item) => item.task_name)).size !== items.length) {
    throw new Error("Selected task names are not unique; refusing to replace the catalog.");
  }
  for (const item of items) {
    item.platforms = Object.fromEntries(Object.entries(item.platforms).sort(([a], [b]) => a.localeCompare(b)));
  }
  const tasks = Object.fromEntries(items.map((item) => [item.task_name, item]));
  return {
    repo_id: HF_DATASET,
    dataset_url: HF_DATASET_URL,
    registry_created_at: registry.manifest.created_at || registry.manifest.created_utc || registry.lastModified || null,
    registry_revision: registry.revision,
    manifest_sha256: registry.manifestSha256,
    registry_path: registry.registryPath,
    registry_url: registry.registryFile.url,
    registry_sha256: registry.registryFile.sha256,
    current_release: registry.manifest.current_release,
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

const [registry, kaggleResponse] = await Promise.all([
  readTaskRegistry(),
  catalogOnly ? null : fetchJson(KAGGLE_API_URL)
]);
const artifacts = buildArtifacts(registry);
const writes = [writeJson(catalogOutput, artifacts)];
if (kaggleResponse) writes.push(writeJson("src/data/kaggleBench.json", buildKaggleSnapshot(kaggleResponse.body)));
await Promise.all(writes);
console.log(`Synced ${Object.keys(artifacts.tasks).length} published AgentArk task mods from ${registry.registryPath} at ${registry.revision}${catalogOnly ? "." : " and the Kaggle leaderboard."}`);
