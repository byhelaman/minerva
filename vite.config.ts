/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().split('T')[0]),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@schedules": path.resolve(__dirname, "./src/features/schedules"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/features/matching/**/*.ts',
        'src/features/schedules/utils/**/*.ts',
        'src/features/schedules/schemas/**/*.ts',
        'src/lib/date-utils.ts',
        'src/lib/rate-limiter.ts',
        'src/lib/utils.ts',
      ],
      exclude: ['**/*.d.ts', '**/types.ts', '**/types/**'],
    },
  },
}));
