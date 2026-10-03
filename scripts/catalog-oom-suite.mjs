import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const worker = path.join(__dirname, 'catalog-oom-worker.mjs')
const fixtureDir = path.join(os.tmpdir(), 'spt-catalog-oom-fixtures')
const outputDir = path.join(os.tmpdir(), 'spt-catalog-oom-results')
const moduleSource = path.resolve(process.argv[2] ?? path.join(repoRoot, 'server', 'catalog-store.mjs'))
const label = String(process.argv[3] ?? 'after').replace(/[^a-z0-9_-]/gi, '-')
const operations = [
  'categoryAdd',
  'subcategoryAdd',
  'categoryUpdate',
  'subcategoryUpdate',
  'categoryOnly',
  'subcategoryOnly',
  'productAdd',
  'productEdit',
  'stress20',
]
const fixtures = [
  ['production', path.join(fixtureDir, 'production-340.json')],
  ['plus300', path.join(fixtureDir, 'plus-300-640.json')],
  ['plus500', path.join(fixtureDir, 'plus-500-840.json')],
]

fs.mkdirSync(outputDir, { recursive: true })
const results = []

for (const [fixtureName, fixturePath] of fixtures) {
  for (const operation of operations) {
    process.stdout.write(`[${label}] ${fixtureName} ${operation}\n`)
    const child = spawnSync(
      process.execPath,
      ['--max-old-space-size=256', '--expose-gc', worker, moduleSource, fixturePath, operation],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
      },
    )
    const stdout = child.stdout ?? ''
    const stderr = child.stderr ?? ''
    const resultLine = stdout.split(/\r?\n/).find((line) => line.startsWith('RESULT\t'))
    let result = null
    if (resultLine) {
      result = JSON.parse(resultLine.slice('RESULT\t'.length))
    }
    results.push({
      fixtureName,
      fixturePath,
      operation,
      exitCode: child.status,
      signal: child.signal,
      error: child.error?.message ?? null,
      result,
      stderr,
    })
    fs.writeFileSync(
      path.join(outputDir, `${label}-${fixtureName}-${operation}.log`),
      `${stdout}${stderr ? `\nSTDERR\n${stderr}` : ''}`,
      'utf8',
    )
  }
}

const reportPath = path.join(outputDir, `${label}-summary.json`)
fs.writeFileSync(reportPath, JSON.stringify({ label, moduleSource, results }, null, 2), 'utf8')
process.stdout.write(`${reportPath}\n`)
