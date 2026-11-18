import { defineConfig } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  images: ["public/favicon.svg"],
  preset: {
    transparent: {
      sizes: [192, 512],
      favicons: [],
    },
    maskable: {
      sizes: [512],
      padding: 0.1,
      resizeOptions: { background: "#5146C8" },
    },
    apple: {
      sizes: [180],
      resizeOptions: { background: "#5146C8" },
    },
  },
  headLinkOptions: {
    preset: "2023",
  },
});
