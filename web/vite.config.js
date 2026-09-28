import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        workbench: resolve(import.meta.dirname, "index.html"),
        fxModule: resolve(import.meta.dirname, "fx-module.html"),
        standaloneSample: resolve(import.meta.dirname, "standalone-sample.html"),
        graphModule: resolve(import.meta.dirname, "graph-module.html"),
        mainLooper: resolve(import.meta.dirname, "main-looper.html"),
      },
    },
  },
});
