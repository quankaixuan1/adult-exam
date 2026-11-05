import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";

export default defineConfig({
  plugins: [vue(), vueDevTools()],
  base: "./",
  devtools: {
    apply: "serve",
    builtinDevTools: false,
    embeddedVisibility: "passive",
    dockPreferences: {
      defaultMode: "edge",
      defaultPosition: "bottom",
    },
  },
});
