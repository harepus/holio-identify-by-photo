import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const server = "http://localhost:8770";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { "/v1": server, "/demo": server },
  },
  build: { outDir: "dist" },
  test: { environment: "node" },
});
