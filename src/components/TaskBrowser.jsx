import { useMemo, useState } from "react";

function matchesValue(value, selected) {
  return selected === "all" || String(value || "").toLowerCase() === selected;
}

function coverUrl(basePath, cover) {
  if (!cover) return "";
  return `${basePath}${cover}`;
}

export default function TaskBrowser({ tasks, basePath }) {
  const [query, setQuery] = useState("");
  const [dimension, setDimension] = useState("all");
  const [status, setStatus] = useState("all");
  const [leaderboard, setLeaderboard] = useState("all");

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
      </div>

      <div className="task-grid">
        {filtered.map((task) => (
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
    </div>
  );
}
