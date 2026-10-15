import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

const dirname = import.meta.dirname;

const preloadFont = (fileName: string): Plugin => ({
  name: "preload-font",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler(_html, { bundle }) {
      const asset = Object.values(bundle ?? {}).find(
        (output) =>
          output.type === "asset" &&
          output.originalFileNames.some((name) => name.endsWith(fileName)),
      );
      if (!asset) throw new Error(`preload-font: ${fileName} is not in the bundle`);

      return [
        {
          tag: "link",
          attrs: {
            rel: "preload",
            href: `/${asset.fileName}`,
            as: "font",
            type: "font/woff2",
            crossorigin: true,
          },
          injectTo: "head",
        },
      ];
    },
  },
});

export default defineConfig({
  plugins: [
    {
      enforce: "pre",
      ...mdx({
        remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
      }),
    },
    tailwindcss(),
    tanstackRouter({ autoCodeSplitting: true }),
    react({ include: /\.(js|jsx|mdx|ts|tsx)$/ }),
    preloadFont("instrument-sans-latin-wght-normal.woff2"),
  ],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  build: {
    outDir: "../server/dist",
  },
});
