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
      resizeOptions: { background: "#F7F7FB" },
    },
    apple: {
      sizes: [180],
      resizeOptions: { background: "#F7F7FB" },
    },
  },
  headLinkOptions: {
    preset: "2023",
  },
});
