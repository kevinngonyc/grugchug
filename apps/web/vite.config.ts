import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // The API runs on its own port in dev; keep the browser same-origin.
    // ws: true is what makes the chat socket at /api/chat/ws upgrade through
    // the proxy instead of being served as a plain HTTP request.
    host: true, // Listens on all local IP addresses
    strictPort: true,
    cors: true,      // Ensures assets can cross network ports safely
    hmr: {
      host: 'localhost', // Keeps hot-reloading stable on your local machine
      clientPort: 5173, // Forces Hot Module Replacement to use the correct port
    },
    proxy: { "/api": { target: "http://0.0.0.0:3000", ws: true } },
  },
});
