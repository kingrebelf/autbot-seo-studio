import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { setupTestEnv, type TestEnv } from './helpers'
import { log, redact, registerSecret, readLogs, logFile } from '../../src/main/logger'
import { exportLogs } from '../../src/main/backup'
import { setSecret } from '../../src/main/secrets'
import { HttpError } from '../../src/main/http'

let env: TestEnv
beforeEach(() => {
  env = setupTestEnv()
})
afterEach(() => env.cleanup())

describe('logger redaction', () => {
  it('redacts well-known key formats', () => {
    const cases = [
      'sk-proj-abcdefghijklmnop1234',
      'sk-ant-api03-abcdefghijklmnop',
      'xai-abcdefghijklmnop1234',
      'AIzaSyA1234567890abcdefghijklmnop',
      'ya29.a0AfH6SMBabcdefghijk',
      'rk-live-abcdefghijk'
    ]
    for (const c of cases) {
      const out = redact(`key was ${c} here`)
      expect(out).not.toContain(c)
      expect(out).toContain('[REDACTED]')
    }
  })

  it('redacts auth headers, JSON fields and query parameters', () => {
    expect(redact('authorization: Bearer abc.def-ghi_jkl123')).toBe('authorization: Bearer [REDACTED]')
    expect(redact('Basic dXNlcjpwYXNzd29yZDEyMw==')).toBe('Basic [REDACTED]')
    expect(redact('{"api_key":"hunter2hunter2","x":1}')).toBe('{"api_key":"[REDACTED]","x":1}')
    expect(redact('"refresh_token": "1//0gabcdef"')).toBe('"refresh_token": "[REDACTED]"')
    expect(redact('password=letmein99&user=bob')).toBe('password=[REDACTED]&user=bob')
    expect(redact('https://x.example/api?key=AAAAAAA&q=lawn')).toBe(
      'https://x.example/api?key=[REDACTED]&q=lawn'
    )
    expect(redact('code_verifier=abcdefgh')).toBe('code_verifier=[REDACTED]')
  })

  it('redacts registered secrets of any shape, but not short values', () => {
    registerSecret('plain-looking-value-42')
    registerSecret('abc')
    expect(redact('token plain-looking-value-42 used')).toBe('token [REDACTED] used')
    expect(redact('abc')).toBe('abc')
  })

  it('secrets saved through setSecret are redacted from the log file, messages, extras and stacks', () => {
    const secret = 'Zq9-wordpress-app-pass-77'
    setSecret('test:thing', secret)
    log.info(`Connecting with ${secret}`)
    log.warn('extra object', { password: secret, nested: { token: secret } })
    log.error(
      'failed',
      new HttpError(401, `{"error":"bad key ${secret}"}`, `https://api.example/v1?api_key=${secret}`)
    )
    const raw = readFileSync(logFile(), 'utf8')
    expect(raw).not.toContain(secret)
    expect(raw).toContain('[REDACTED]')
    expect(raw).toMatch(/\[INFO\] Connecting with \[REDACTED\]/)
    expect(readLogs()).not.toContain(secret)
    const dest = env.tmp('logs.txt')
    exportLogs(dest)
    expect(existsSync(dest)).toBe(true)
    expect(readFileSync(dest, 'utf8')).not.toContain(secret)
  })

  it('never throws when the log cannot be written', () => {
    expect(() =>
      log.info('x', {
        toJSON: () => {
          throw new Error('boom')
        }
      })
    ).not.toThrow()
  })
})
