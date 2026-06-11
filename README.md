# AgentArk Hub

A GitHub Pages site for browsing AgentArk tasks and public aggregate leaderboards.

## Local Development

```bash
npm install
npm run import:results
npm run dev
```

The import command reads local AgentArk JSONL files from `../agent-ark/tmp` and writes
aggregate-only public data to `src/data/leaderboards.json`.

## Build

```bash
npm run build
npm run preview
```

The site is configured as a GitHub Pages project site with `base: "/agentark-hub"`.

## Published Data Policy

- Published leaderboard data is aggregate-only.
- Raw JSONL trajectories, prompts, model responses, API config, usage, and image payloads are not committed.
- Task3 is intentionally skipped in the first import until model seed coverage is complete.

## Manual Media

Task cover images can be added under `public/media/tasks/` and referenced from the
corresponding `src/content/tasks/*.mdx` frontmatter.
