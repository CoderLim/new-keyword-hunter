import { defineConfig } from "plasmo"

export default defineConfig({
  src: "src",
  projects: [
    {
      manifest: {
        name: "新词挖掘助手",
        description: "从 Google Trends 中挖掘新兴关键词",
        version: "1.0.0",
        permissions: ["webRequest", "storage", "tabs", "downloads", "sidePanel"],
        host_permissions: ["*://trends.google.com/*"],
        side_panel: {
          default_path: "side-panel.html"
        }
      }
    }
  ],
  assets: {
    ignore: ["**/*.tsx", "**/*.ts"]
  }
})
