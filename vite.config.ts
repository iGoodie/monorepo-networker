import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts()],
  build: {
    target: "es6",
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      name: "monorepo-networker",
      fileName: "monorepo-networker",
    },
  },
});
