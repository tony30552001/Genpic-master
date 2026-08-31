import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setupTests.js",
    css: true,
    // 這兩個目錄含有整個 repo 的複本，會被誤判為待測檔案。
    exclude: [
      ...configDefaults.exclude,
      "**/.superpowers/**",
      "**/.pnpm-store/**",
    ],
  },
})
