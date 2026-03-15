#!/usr/bin/env node

import { spawn } from "child_process"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(currentDir, "..")
const devBuildDir = path.join(projectRoot, "build", "chrome-mv3-dev")
const manifestPath = path.join(devBuildDir, "manifest.json")

function ensureSidePanelFiles() {
  const files = ["side-panel.html", "side-panel.js"]

  for (const fileName of files) {
    const sourcePath = path.join(projectRoot, "static", fileName)
    const targetPath = path.join(devBuildDir, fileName)

    if (!fs.existsSync(sourcePath)) {
      continue
    }

    if (!fs.existsSync(devBuildDir)) {
      fs.mkdirSync(devBuildDir, { recursive: true })
    }

    const sourceStat = fs.statSync(sourcePath)
    const targetStat = fs.existsSync(targetPath) ? fs.statSync(targetPath) : null

    if (!targetStat || sourceStat.mtimeMs > targetStat.mtimeMs) {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}

function ensureManifestSidePanel() {
  if (!fs.existsSync(manifestPath)) {
    return
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))

  if (manifest.side_panel?.default_path === "side-panel.html") {
    return
  }

  manifest.side_panel = {
    ...(manifest.side_panel || {}),
    default_path: "side-panel.html"
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 0))
  console.log("Patched dev manifest with side_panel.default_path")
}

function patchDevBuild() {
  ensureSidePanelFiles()
  ensureManifestSidePanel()
}

const plasmoBinary = process.platform === "win32" ? "plasmo.cmd" : "plasmo"
const plasmoPath = path.join(projectRoot, "node_modules", ".bin", plasmoBinary)

const devProcess = spawn(plasmoPath, ["dev"], {
  cwd: projectRoot,
  stdio: "inherit"
})

try {
  patchDevBuild()
} catch (error) {
  console.error("Failed to patch dev build:", error)
}

const patchTimer = setInterval(() => {
  try {
    patchDevBuild()
  } catch (error) {
    console.error("Failed to patch dev build:", error)
  }
}, 1000)

const shutdown = (signal) => {
  clearInterval(patchTimer)

  if (!devProcess.killed) {
    devProcess.kill(signal)
  }
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))

devProcess.on("exit", (code) => {
  clearInterval(patchTimer)
  process.exit(code ?? 0)
})
