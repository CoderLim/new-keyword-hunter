#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const manifestPath = process.argv[2] || 'build/chrome-mv3-prod/manifest.json'

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

  // Add side_panel if not present
  if (!manifest.side_panel) {
    manifest.side_panel = {
      default_path: 'side-panel.html'
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 0))
  console.log('Manifest updated successfully')
} catch (error) {
  console.error('Error updating manifest:', error)
  process.exit(1)
}
