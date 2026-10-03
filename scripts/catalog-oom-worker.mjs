import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

const [, , moduleSource, fixtureSource, operation] = process.argv

if (!moduleSource || !fixtureSource || !operation) {
  throw new Error('Usage: node catalog-oom-worker.mjs <catalog-store-module> <fixture> <operation>')
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), '..')
const tempParent = path.join(repoRoot, 'tmp')
fs.mkdirSync(tempParent, { recursive: true })
const root = fs.mkdtempSync(path.join(tempParent, 'catalog-oom-worker-'))
const serverDir = path.join(root, 'server')
const dataDir = path.join(root, 'data')
fs.mkdirSync(serverDir)
fs.mkdirSync(dataDir)
const catalogPath = path.join(dataDir, 'catalog.json')
fs.copyFileSync(path.resolve(moduleSource), path.join(serverDir, 'catalog-store.mjs'))
fs.copyFileSync(path.join(repoRoot, 'server', 'catalog.seed.json'), path.join(serverDir, 'catalog.seed.json'))
fs.copyFileSync(path.resolve(fixtureSource), catalogPath)

const originalJsonParse = JSON.parse
const originalJsonStringify = JSON.stringify
const originalReadFileSync = fs.readFileSync
const originalOpenSync = fs.openSync
const originalWriteFileSync = fs.writeFileSync
const fileDescriptors = new Map()
const catalogSize = fs.statSync(catalogPath).size
const simulatedBaselineMiB = Number(process.env.CATALOG_BENCHMARK_BASELINE_MIB ?? 0)
const simulatedBaseline = []

if (Number.isFinite(simulatedBaselineMiB) && simulatedBaselineMiB > 0) {
  const targetBytes = Math.floor(simulatedBaselineMiB * 1024 * 1024)
  for (let index = 0; index < targetBytes; index += 128) {
    simulatedBaseline.push({
      index,
      value: `${index.toString(36)}-${'x'.repeat(96)}`,
    })
  }
}
const metrics = {
  catalogReadCalls: 0,
  parseCalls: 0,
  wholeCatalogParseCalls: 0,
  stringifyCalls: 0,
  wholeCatalogStringifyCalls: 0,
  catalogWriteCalls: 0,
  largestParseBytes: 0,
  largestStringifyBytes: 0,
  peakRss: 0,
  peakHeapUsed: 0,
  peakHeapTotal: 0,
  peakPhase: 'startup',
}

const sample = (phase) => {
  const memory = process.memoryUsage()
  if (memory.rss > metrics.peakRss || memory.heapUsed > metrics.peakHeapUsed) {
    metrics.peakPhase = phase
  }
  metrics.peakRss = Math.max(metrics.peakRss, memory.rss)
  metrics.peakHeapUsed = Math.max(metrics.peakHeapUsed, memory.heapUsed)
  metrics.peakHeapTotal = Math.max(metrics.peakHeapTotal, memory.heapTotal)
  return memory
}

const emitLargePhase = (phase, bytes) => {
  const memory = sample(phase)
  process.stdout.write(`PHASE\t${phase}\t${bytes}\t${memory.rss}\t${memory.heapUsed}\t${memory.heapTotal}\n`)
}

fs.openSync = (...args) => {
  const fd = originalOpenSync(...args)
  if (typeof args[0] === 'string') {
    fileDescriptors.set(fd, path.resolve(args[0]))
  }
  return fd
}

fs.readFileSync = (...args) => {
  const result = originalReadFileSync(...args)
  if (typeof args[0] === 'string' && path.resolve(args[0]) === catalogPath) {
    metrics.catalogReadCalls += 1
    emitLargePhase('catalog-read-result', typeof result === 'string' ? Buffer.byteLength(result) : result.byteLength)
  }
  return result
}

fs.writeFileSync = (...args) => {
  const target = typeof args[0] === 'number' ? fileDescriptors.get(args[0]) : path.resolve(String(args[0]))
  if (target?.startsWith(dataDir)) {
    metrics.catalogWriteCalls += 1
    const bytes = typeof args[1] === 'string' ? Buffer.byteLength(args[1]) : args[1]?.byteLength ?? 0
    emitLargePhase('catalog-write-input', bytes)
  }
  return originalWriteFileSync(...args)
}

JSON.parse = (...args) => {
  const bytes = typeof args[0] === 'string' ? Buffer.byteLength(args[0]) : 0
  const result = originalJsonParse(...args)
  metrics.parseCalls += 1
  metrics.largestParseBytes = Math.max(metrics.largestParseBytes, bytes)
  if (bytes >= catalogSize * 0.9) {
    metrics.wholeCatalogParseCalls += 1
    emitLargePhase('whole-catalog-parse-result', bytes)
  } else {
    sample('json-parse-result')
  }
  return result
}

JSON.stringify = (...args) => {
  const result = originalJsonStringify(...args)
  const bytes = typeof result === 'string' ? Buffer.byteLength(result) : 0
  metrics.stringifyCalls += 1
  metrics.largestStringifyBytes = Math.max(metrics.largestStringifyBytes, bytes)
  if (bytes >= catalogSize * 0.9) {
    metrics.wholeCatalogStringifyCalls += 1
    emitLargePhase('whole-catalog-stringify-result', bytes)
  } else {
    sample('json-stringify-result')
  }
  return result
}

const restoreInstrumentation = () => {
  JSON.parse = originalJsonParse
  JSON.stringify = originalJsonStringify
  fs.readFileSync = originalReadFileSync
  fs.openSync = originalOpenSync
  fs.writeFileSync = originalWriteFileSync
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const eventLoop = monitorEventLoopDelay({ resolution: 1 })
let interval = null
const operationLatencies = []

try {
  eventLoop.enable()
  interval = setInterval(() => sample('interval'), 1)
  interval.unref()
  await delay(20)

  const moduleUrl = `${pathToFileURL(path.join(serverDir, 'catalog-store.mjs')).href}?benchmark=${Date.now()}-${Math.random()}`
  const store = await import(moduleUrl)
  sample('module-imported')
  const initialized = store.ensureCatalogStore()
  sample('catalog-initialized')
  const initializationPeak = {
    rss: metrics.peakRss,
    heapUsed: metrics.peakHeapUsed,
    heapTotal: metrics.peakHeapTotal,
    phase: metrics.peakPhase,
  }
  await delay(20)
  const naturalIdle = sample('natural-idle')
  if (global.gc) {
    global.gc()
  }
  const forcedGcIdle = sample('forced-gc-idle')
  const first = initialized.products[0]
  const latencyRuns = Math.max(1, Number(process.env.CATALOG_BENCHMARK_LATENCY_RUNS ?? 12))
  const measureWrite = async (operationToMeasure) => {
    const startedAt = performance.now()
    await operationToMeasure()
    operationLatencies.push(performance.now() - startedAt)
  }

  const operations = {
    readOnly: async () => undefined,
    categoryAdd: () => store.addCategory({ id: 'benchmark-category', nameFi: 'Benchmark-kategoria', nameEn: 'Benchmark category' }),
    subcategoryAdd: () => store.addCategory({ id: 'benchmark-child', nameFi: 'Benchmark-alakategoria', nameEn: 'Benchmark subcategory', parentId: 'main' }),
    categoryUpdate: () => store.updateCategory('main', { nameFi: 'Pääkategoria päivitetty', nameEn: 'Main category updated', parentId: '' }),
    subcategoryUpdate: () => store.updateCategory('child', { nameFi: 'Alakategoria päivitetty', nameEn: 'Subcategory updated', parentId: 'main' }),
    categoryOnly: () => store.updateProductCategory(first.id, first.category === 'main' ? 'child' : 'main'),
    subcategoryOnly: () => store.updateProductCategory(first.id, 'child'),
    productAdd: () => store.upsertProduct({ ...first, id: 'benchmark-new-product', slug: 'benchmark-new-product', sku: 'BENCHMARK-NEW', name: 'Benchmark new product' }),
    productEdit: () => store.upsertProduct({ ...first, price: Number(first.price) + 0.5, description: `${first.description} Benchmark edit.` }),
    stress20: async () => {
      for (let index = 0; index < 20; index += 1) {
        await store.updateCategory('main', {
          nameFi: `Pääkategoria ${index}`,
          nameEn: `Main category ${index}`,
          parentId: '',
        })
        sample(`stress-${index + 1}`)
      }
    },
    latencyCategoryAdd: async () => {
      for (let index = 0; index < latencyRuns; index += 1) {
        await measureWrite(() =>
          store.addCategory({
            id: `latency-category-${index}`,
            nameFi: `Latency category ${index}`,
            nameEn: `Latency category ${index}`,
          }),
        )
      }
    },
    latencySubcategoryAdd: async () => {
      for (let index = 0; index < latencyRuns; index += 1) {
        await measureWrite(() =>
          store.addCategory({
            id: `latency-subcategory-${index}`,
            nameFi: `Latency subcategory ${index}`,
            nameEn: `Latency subcategory ${index}`,
            parentId: 'main',
          }),
        )
      }
    },
    latencyCategoryOnly: async () => {
      for (let index = 0; index < latencyRuns; index += 1) {
        await measureWrite(() => store.updateProductCategory(first.id, index % 2 === 0 ? 'child' : 'main'))
      }
    },
    latencyProductAdd: async () => {
      for (let index = 0; index < latencyRuns; index += 1) {
        await measureWrite(() =>
          store.upsertProduct({
            ...first,
            id: `latency-product-${index}`,
            slug: `latency-product-${index}`,
            sku: `LATENCY-${index}`,
            name: `Latency product ${index}`,
          }),
        )
      }
    },
    latencyProductEdit: async () => {
      for (let index = 0; index < latencyRuns; index += 1) {
        const current = store.readCatalog().products.find((product) => product.id === first.id)
        await measureWrite(() =>
          store.upsertProduct({
            ...current,
            description: `Latency edit ${index}`,
          }),
        )
      }
    },
  }

  if (!operations[operation]) {
    throw new Error(`Unknown operation: ${operation}`)
  }

  eventLoop.reset()
  await delay(5)
  const operationStart = performance.now()
  await operations[operation]()
  const operationMs = performance.now() - operationStart
  sample('operation-complete')
  await delay(30)
  const naturalAfter = sample('natural-after')
  const beforeDiagnosticGc = process.memoryUsage()
  if (global.gc) {
    global.gc()
  }
  const afterDiagnosticGc = sample('diagnostic-gc-after')
  eventLoop.disable()
  clearInterval(interval)
  interval = null
  restoreInstrumentation()

  const result = {
    ok: true,
    operation,
    catalogBytes: catalogSize,
    productCount: initialized.products.length,
    simulatedBaselineMiB,
    simulatedBaselineItems: simulatedBaseline.length,
    operationMs,
    operationLatencies,
    initializationPeak,
    eventLoopMaxMs: eventLoop.max / 1e6,
    eventLoopMeanMs: eventLoop.mean / 1e6,
    idle: naturalIdle,
    forcedGcIdle,
    naturalAfter,
    beforeDiagnosticGc,
    afterDiagnosticGc,
    metrics,
  }
  process.stdout.write(`RESULT\t${originalJsonStringify(result)}\n`)
} catch (error) {
  if (interval) {
    clearInterval(interval)
  }
  eventLoop.disable()
  restoreInstrumentation()
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
