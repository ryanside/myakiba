import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const dirname = import.meta.dirname;

/** The Add sentence alone, with the app's stylesheet, for the browser check to lay out. */
export default defineConfig({
  root: dirname,
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "../../src"),
    },
  },
});
