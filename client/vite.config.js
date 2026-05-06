import path from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig, splitVendorChunkPlugin } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), splitVendorChunkPlugin()],
  optimizeDeps: {
    force: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@utils": path.resolve(__dirname, "./src/utils"),
      "@store": path.resolve(__dirname, "./src/store"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("@clerk")) return "vendor-clerk";
          if (
            id.includes("socket.io-client") ||
            id.includes("zego") ||
            id.includes("@stream-io") ||
            id.includes("firebase")
          ) {
            return "vendor-realtime";
          }
          if (
            id.includes("framer-motion") ||
            id.includes("emoji-picker-react") ||
            id.includes("react-cropper") ||
            id.includes("cropperjs")
          ) {
            return "vendor-ui-heavy";
          }
          if (id.includes("lucide-react") || id.includes("react-icons")) {
            return "vendor-icons";
          }

          return "vendor";
        },
      },
    },
  },

  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:8747",
        changeOrigin: true,
      },
    },
  },
});
