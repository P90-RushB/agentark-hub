import { useEffect, useMemo, useState } from "react";

function matchesValue(value, selected) {
  return selected === "all" || String(value || "").toLowerCase() === selected;
}

function coverUrl(basePath, cover) {
  if (!cover) return "";
  return `${basePath}${cover}`;
}

export default function TaskBrowser({ tasks, basePath, pageSize = 12 }) {
  const [query, setQuery] = useState("");
  const [dimension, setDimension] = useState("all");
  const [status, setStatus] = useState("all");
  const [leaderboard, setLeaderboard] = useState("all");
  const [page, setPage] = useState(1);
  const normalizedPageSize = Math.max(1, Number(pageSize) || 12);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const text = `${task.title} ${task.taskId} ${task.summary}`.toLowerCase();
      const hasLeaderboard = task.hasLeaderboard ? "yes" : "no";
      return (
        (!q || text.includes(q)) &&
        matchesValue(task.dimension, dimension) &&
        matchesValue(task.status, status) &&
        matchesValue(hasLeaderboard, leaderboard)
      );
    });
  }, [dimension, leaderboard, query, status, tasks]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / normalizedPageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * normalizedPageSize;
  const visibleTasks = filtered.slice(startIndex, startIndex + normalizedPageSize);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  useEffect(() => {
    setPage(1);
  }, [dimension, leaderboard, query, status]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div>
      <div className="filter-shell">
        <div className="filter-controls">
          <input
            aria-label="Search tasks"
            placeholder="Search tasks"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label="Filter by dimension"
            value={dimension}
            onChange={(event) => setDimension(event.target.value)}
          >
            <option value="all">All dimensions</option>
            <option value="2d">2D</option>
            <option value="3d">3D</option>
          </select>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="live">Live</option>
            <option value="pending">Pending</option>
          </select>
          <select
            aria-label="Filter by leaderboard availability"
            value={leaderboard}
            onChange={(event) => setLeaderboard(event.target.value)}
          >
            <option value="all">Any leaderboard</option>
            <option value="yes">Has leaderboard</option>
            <option value="no">No leaderboard</option>
          </select>
        </div>
        <div className="task-browser-meta">
          {filtered.length === 0
            ? "No tasks matched"
            : `${startIndex + 1}-${Math.min(startIndex + visibleTasks.length, filtered.length)} of ${filtered.length} tasks`}
        </div>
      </div>

      {visibleTasks.length > 0 ? (
        <div className="task-grid">
          {visibleTasks.map((task) => (
            <a className="task-card" href={`${basePath}/tasks/${task.slug}/`} key={task.slug}>
              <div className="task-card-media">
                {task.cover ? (
                  <img alt="" src={coverUrl(basePath, task.cover)} />
                ) : (
                  <div className="fallback-cover">
                    <strong>{task.title}</strong>
                  </div>
                )}
              </div>
              <div className="task-card-body">
                <div className="pill-row">
                  <span className="pill">{task.taskId}</span>
                  <span className="pill">{task.dimension.toUpperCase()}</span>
                  <span className={`pill ${task.status}`}>{task.status}</span>
                </div>
                <h3>{task.title}</h3>
                <p className="muted">{task.summary}</p>
                <div className="rank-line">
                  <span>Best</span>
                  <strong>{task.bestModel || "Pending"}</strong>
                </div>
                <div className="rank-line">
                  <span>Mean score</span>
                  <strong>{task.bestScore || "N/A"}</strong>
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="empty-state">No tasks match the current filters.</div>
      )}

      {totalPages > 1 ? (
        <nav className="pagination" aria-label="Task pages">
          <button
            className="page-button"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            type="button"
          >
            Previous
          </button>
          {pageNumbers.map((pageNumber) => (
            <button
              aria-current={pageNumber === currentPage ? "page" : undefined}
              className={`page-button ${pageNumber === currentPage ? "active" : ""}`}
              key={pageNumber}
              onClick={() => setPage(pageNumber)}
              type="button"
            >
              {pageNumber}
            </button>
          ))}
          <button
            className="page-button"
            disabled={currentPage === totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            type="button"
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
