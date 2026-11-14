import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const dirname = import.meta.dirname;

/** Lists that fade their foot, with the app's stylesheet, for the browser check to scroll. */
export default defineConfig({
  root: dirname,
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "../../src"),
    },
  },
});
