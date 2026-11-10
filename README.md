# AgentArk Hub

A GitHub Pages storefront for all published AgentArk task Mods, with the
canonical AgentArk Bench results surfaced from Kaggle.

## Local Development

```bash
npm install
npm run dev
```

`npm run build` and GitHub Pages build from two committed public snapshots:

- published task Mods from the [AgentArk Hugging Face dataset](https://huggingface.co/datasets/P90-RushB/AgentArk);
- the [AgentArk Bench leaderboard on Kaggle](https://www.kaggle.com/benchmarks/xunyiljg/agentark-bench).

The catalog reads `manifest.json` and its canonical task registry at one immutable
Hugging Face commit. Download links retain that commit and the registry's archive
hashes. The latest registered environment/task version pair is selected for each task;
unregistered files are not treated as published tasks.

Run `npm run sync:catalog` to refresh both snapshots before reviewing and committing
them. To refresh only task metadata at a particular published commit, keeping the
existing leaderboard snapshot, run:

```bash
npm run sync:catalog -- --catalog-only --revision <full-hf-commit-sha>
```

Add `--catalog-output <path>` to write a catalog candidate separately for review.

## Build

```bash
npm run build
npm run preview
```

The site is configured for GitHub Pages at `https://agentark.net/`, served from the
domain root. Configure `agentark.net` as the Pages custom domain and point its DNS
to GitHub Pages before deploying.

## Manual Media

Task cover images can be added under `public/media/tasks/` and referenced from the
corresponding `src/content/tasks/*.mdx` frontmatter.

Task introduction links are maintained in `src/data/taskVideos.json`, keyed by
the canonical task name from the published artifact registry. Task pages show an
introduction video card with a Bilibili player and an "Open on Bilibili" link above
the task brief, including pages without an MDX entry. Players use a 16:9 frame and
do not autoplay. A nonempty `videoUrl` in task frontmatter overrides the shared mapping.
