import { useEffect, useMemo, useState } from "react";

const featuredTags = ["3d", "2d", "multimodal", "gui", "charts-data", "color", "arc-like", "pvz", "pure-text", "physics"];
const tagLabels = {
  "3d": "3D", "2d": "2D", multimodal: "Multimodal", gui: "GUI", "charts-data": "Charts & Data",
  color: "Color Lab", "arc-like": "ARC-like", pvz: "PvZ", "pure-text": "Pure text", physics: "Physics",
  probuilder: "3D Creation", grid: "Grid", "multi-view": "Multi-view", video: "Video", timing: "Timing",
  "code-mode": "Code mode", "tables-data": "Tables & Data", strategy: "Strategy"
};

function coverUrl(basePath, cover) {
  return cover ? `${basePath}${cover}` : "";
}

function getInitialTag() {
  return typeof window === "undefined" ? "all" : new URLSearchParams(window.location.search).get("tag") || "all";
}

function displayTag(tag) {
  return tagLabels[tag] || String(tag).replace(/-/g, " ");
}

export default function TaskBrowser({ tasks, basePath, pageSize = 12 }) {
  const [query, setQuery] = useState("");
  const [dimension, setDimension] = useState("all");
  const [tag, setTag] = useState(getInitialTag);
  const [page, setPage] = useState(1);
  const normalizedPageSize = Math.max(1, Number(pageSize) || 12);
  const tagCounts = useMemo(() => {
    const counts = new Map();
    tasks.forEach((task) => task.tags.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1)));
    return counts;
  }, [tasks]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const text = `${task.title} ${task.taskId} ${task.summary} ${task.tags.join(" ")}`.toLowerCase();
      return (!q || text.includes(q)) && (dimension === "all" || task.dimension === dimension) && (tag === "all" || task.tags.includes(tag));
    });
  }, [dimension, query, tag, tasks]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / normalizedPageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * normalizedPageSize;
  const visibleTasks = filtered.slice(startIndex, startIndex + normalizedPageSize);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  useEffect(() => setPage(1), [dimension, query, tag]);

  return (
    <div>
      <div className="filter-shell">
        <div className="filter-controls">
          <input aria-label="Search tasks" placeholder="Search 216 published tasks" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label="Filter by dimension" value={dimension} onChange={(event) => setDimension(event.target.value)}>
            <option value="all">All formats</option><option value="2d">2D</option><option value="3d">3D</option>
          </select>
          <select aria-label="Filter by tag" value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="all">All categories</option>
            {[...tagCounts.keys()].sort().map((value) => <option key={value} value={value}>{displayTag(value)} ({tagCounts.get(value)})</option>)}
          </select>
        </div>
        <div className="tag-row" aria-label="Popular task tags">
          <button className={`tag-button ${tag === "all" ? "active" : ""}`} onClick={() => setTag("all")} type="button">All</button>
          {featuredTags.filter((value) => tagCounts.has(value)).map((value) => <button className={`tag-button ${tag === value ? "active" : ""}`} key={value} onClick={() => setTag(value)} type="button">{displayTag(value)} <span>{tagCounts.get(value)}</span></button>)}
        </div>
        <div className="task-browser-meta">{filtered.length === 0 ? "No published tasks matched" : `${startIndex + 1}-${Math.min(startIndex + visibleTasks.length, filtered.length)} of ${filtered.length} published task mods`}</div>
      </div>

      {visibleTasks.length > 0 ? <div className="task-grid">
        {visibleTasks.map((task) => <a className="task-card" href={`${basePath}/tasks/${task.slug}/`} key={task.slug}>
          <div className="task-card-media">
            {task.cover ? <img alt="" src={coverUrl(basePath, task.cover)} /> : <div className="fallback-cover"><span>Task {task.taskNumber}</span><strong>{task.title}</strong></div>}
            {task.onKaggleBench ? <span className="benchmark-badge">Kaggle Bench</span> : null}
          </div>
          <div className="task-card-body">
            <div className="pill-row"><span className="pill">Task {task.taskNumber}</span><span className="pill">{task.dimension.toUpperCase()}</span>{task.platforms.map((platform) => <span className="pill platform" key={platform}>{platform}</span>)}</div>
            <h3>{task.title}</h3><p className="muted">{task.summary}</p>
            <div className="tag-row compact">{task.tags.slice(0, 3).map((value) => <span className="task-tag" key={value}>{displayTag(value)}</span>)}</div>
          </div>
        </a>)}
      </div> : <div className="empty-state">No published tasks match the current filters.</div>}

      {totalPages > 1 ? <nav className="pagination" aria-label="Task pages">
        <button className="page-button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button>
        {pageNumbers.map((pageNumber) => <button aria-current={pageNumber === currentPage ? "page" : undefined} className={`page-button ${pageNumber === currentPage ? "active" : ""}`} key={pageNumber} onClick={() => setPage(pageNumber)} type="button">{pageNumber}</button>)}
        <button className="page-button" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} type="button">Next</button>
      </nav> : null}
    </div>
  );
}
