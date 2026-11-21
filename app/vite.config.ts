import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Akıcı — İngilizce", short_name: "Akıcı", lang: "tr", start_url: "./", display: "standalone",
        background_color: "#f7f4ee", theme_color: "#5b4bff",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.includes("/data/"), handler: "StaleWhileRevalidate", options: { cacheName: "akici-data", expiration: { maxEntries: 200 } } },
          { urlPattern: ({ url }) => url.pathname.includes("/audio/"), handler: "CacheFirst", options: { cacheName: "akici-audio", expiration: { maxEntries: 8000 } } },
        ],
      },
    }),
  ],
  server: { host: "127.0.0.1", port: 5173, proxy: { "/api": "http://127.0.0.1:8790" } },
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
});
