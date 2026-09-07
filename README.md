# AgentArk Hub

A GitHub Pages storefront for all published AgentArk task Mods, with the
canonical AgentArk Bench results surfaced from Kaggle.

## Local Development

```bash
npm install
npm run dev
```

`npm run build` refreshes two committed public snapshots before Astro builds:

- published task Mods from the [AgentArk Hugging Face dataset](https://huggingface.co/datasets/P90-RushB/AgentArk);
- the [AgentArk Bench leaderboard on Kaggle](https://www.kaggle.com/benchmarks/xunyiljg/agentark-bench).

## Build

```bash
npm run build
npm run preview
```

The site is configured as a GitHub Pages project site with `base: "/agentark-hub"`.

## Manual Media

Task cover images can be added under `public/media/tasks/` and referenced from the
corresponding `src/content/tasks/*.mdx` frontmatter.
