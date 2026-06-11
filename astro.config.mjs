import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://p90-rushb.github.io",
  base: "/agentark-hub",
  output: "static",
  integrations: [mdx(), react()]
});
