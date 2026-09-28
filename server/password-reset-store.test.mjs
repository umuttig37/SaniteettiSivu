import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testTempDir = path.resolve(__dirname, '..', 'tmp')

const createIsolatedStore = async () => {
  fs.mkdirSync(testTempDir, { recursive: true })
  const root = fs.mkdtempSync(path.join(testTempDir, 'paperitukku-reset-token-test-'))
  const serverDir = path.join(root, 'server')
  fs.mkdirSync(serverDir)
  fs.copyFileSync(path.join(__dirname, 'password-reset-store.mjs'), path.join(serverDir, 'password-reset-store.mjs'))
  const moduleUrl = `${pathToFileURL(path.join(serverDir, 'password-reset-store.mjs')).href}?test=${Date.now()}-${Math.random()}`
  return { root, store: await import(moduleUrl) }
}

test('password reset tokens are hashed, account-bound, expiring and single-use', async () => {
  const isolated = await createIsolatedStore()

  try {
    const firstToken = await isolated.store.createPasswordResetToken('customer-a', { now: 1_000, ttlMs: 60_000 })
    const tokenFile = isolated.store.getPasswordResetTokenFilePath()
    const storedContent = fs.readFileSync(tokenFile, 'utf8')
    const stored = JSON.parse(storedContent)

    assert.equal(storedContent.includes(firstToken), false)
    assert.equal(stored.tokens[0].tokenHash, crypto.createHash('sha256').update(firstToken).digest('hex'))
    assert.deepEqual(isolated.store.validatePasswordResetToken(firstToken, { now: 2_000 }), {
      customerId: 'customer-a',
      expiresAt: 61_000,
    })
    assert.equal(isolated.store.validatePasswordResetToken('wrong-token', { now: 2_000 }), null)

    const replacementToken = await isolated.store.createPasswordResetToken('customer-a', { now: 3_000, ttlMs: 60_000 })
    assert.equal(isolated.store.validatePasswordResetToken(firstToken, { now: 4_000 }), null)
    assert.equal(isolated.store.validatePasswordResetToken(replacementToken, { now: 4_000 }).customerId, 'customer-a')

    const consumed = await isolated.store.consumePasswordResetToken(replacementToken, { now: 5_000 })
    assert.deepEqual(consumed, { customerId: 'customer-a' })
    assert.equal(await isolated.store.consumePasswordResetToken(replacementToken, { now: 5_001 }), null)

    const accountBToken = await isolated.store.createPasswordResetToken('customer-b', { now: 10_000, ttlMs: 100 })
    assert.equal(isolated.store.validatePasswordResetToken(accountBToken, { now: 10_050 }).customerId, 'customer-b')
    assert.equal(isolated.store.validatePasswordResetToken(accountBToken, { now: 10_101 }), null)
    assert.equal(await isolated.store.consumePasswordResetToken(accountBToken, { now: 10_101 }), null)
    assert.equal(fs.readdirSync(path.dirname(tokenFile)).some((name) => name.endsWith('.tmp')), false)
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('a broken reset token store is never replaced', async () => {
  const isolated = await createIsolatedStore()
  const tokenFile = isolated.store.getPasswordResetTokenFilePath()
  isolated.store.ensurePasswordResetStore()
  fs.writeFileSync(tokenFile, '{ broken reset token data', 'utf8')
  const originalConsoleError = console.error
  console.error = () => undefined

  try {
    await assert.rejects(isolated.store.createPasswordResetToken('customer-a'), /could not be read/)
    assert.equal(fs.readFileSync(tokenFile, 'utf8'), '{ broken reset token data')
  } finally {
    console.error = originalConsoleError
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})

test('an empty reset token store is treated as an empty runtime store', async () => {
  const isolated = await createIsolatedStore()
  const tokenFile = isolated.store.getPasswordResetTokenFilePath()
  isolated.store.ensurePasswordResetStore()
  fs.writeFileSync(tokenFile, '', 'utf8')

  try {
    const token = await isolated.store.createPasswordResetToken('customer-a')
    assert.equal(isolated.store.validatePasswordResetToken(token).customerId, 'customer-a')
  } finally {
    fs.rmSync(isolated.root, { recursive: true, force: true })
  }
})
