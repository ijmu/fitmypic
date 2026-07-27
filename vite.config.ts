import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        resize1024: resolve(__dirname, "resize-image-to-1024x1024.html"),
        youtube: resolve(__dirname, "resize-image-for-youtube.html"),
      },
    },
  },
});
