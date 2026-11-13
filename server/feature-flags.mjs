import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const featureFlagsPath = path.resolve(__dirname, '..', 'config', 'feature-flags.json')

export const featureFlags = Object.freeze(
  JSON.parse(fs.readFileSync(featureFlagsPath, 'utf8')),
)
