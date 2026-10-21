import { env } from "@myakiba/env/extension";
import { defineConfig } from "wxt";

export default defineConfig({
  imports: false,
  manifest: {
    name: "myakiba",
    description:
      "Brings MyFigureCollection items into myakiba with your MyFigureCollection session.",
    permissions: ["scripting", "storage"],
    host_permissions: [`${env.WXT_MFC_ORIGIN}/*`, `${env.WXT_MFC_STATIC_ORIGIN}/*`],
  },
});
