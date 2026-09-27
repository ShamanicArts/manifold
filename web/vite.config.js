import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        workbench: resolve(import.meta.dirname, "index.html"),
        fxModule: resolve(import.meta.dirname, "fx-module.html"),
        graphModule: resolve(import.meta.dirname, "graph-module.html"),
      },
    },
  },
});
