import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Base44 vite plugin je uklonjen (D1): davao je samo alias "@/" i Base44 alate (analitika, vizuelni editor).
export default defineConfig({
  logLevel: "error",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
