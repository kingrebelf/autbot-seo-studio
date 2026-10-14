import { appendFileSync, mkdirSync, readFileSync, existsSync, statSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { rt } from './runtime'

const knownSecrets = new Set<string>()

/** Register a secret value so it is scrubbed from every log line. */
export function registerSecret(value: string | undefined | null): void {
  if (value && value.length >= 6) knownSecrets.add(value)
}

const RULES: [RegExp, string][] = [
  [/\bsk-ant-[\w-]{8,}/g, '[REDACTED]'],
  [/\b(?:sk|pk|rk)-[\w-]{8,}/g, '[REDACTED]'],
  [/\bxai-[\w-]{8,}/g, '[REDACTED]'],
  [/\bAIza[\w-]{20,}/g, '[REDACTED]'],
  [/\bya29\.[\w.-]+/g, '[REDACTED]'],
  [/\b(Bearer|Basic)\s+[\w+/=.-]{8,}/gi, '$1 [REDACTED]'],
  [
    /("?(?:api[_-]?key|access_token|refresh_token|id_token|client_secret|password|app_password|x-api-key|code_verifier)"?\s*[:=]\s*"?)[^"\s,&}]{6,}/gi,
    '$1[REDACTED]'
  ],
  [/([?&](?:key|apikey|api_key|access_token|token|code)=)[^&\s"]+/gi, '$1[REDACTED]']
]

export function redact(text: string): string {
  let out = text
  for (const s of knownSecrets) out = out.split(s).join('[REDACTED]')
  for (const [re, rep] of RULES) out = out.replace(re, rep)
  return out
}

export function logDir(): string {
  return join(rt().dataDir, 'logs')
}

export function logFile(): string {
  return join(logDir(), 'app.log')
}

function write(level: string, msg: string, extra?: unknown): void {
  let line = `${new Date().toISOString()} [${level}] ${msg}`
  if (extra !== undefined) {
    if (extra instanceof Error) line += `\n${extra.stack ?? extra.message}`
    else {
      try {
        line += ` ${JSON.stringify(extra)}`
      } catch {
        line += ` ${String(extra)}`
      }
    }
  }
  line = redact(line)
  try {
    mkdirSync(logDir(), { recursive: true })
    const file = logFile()
    if (existsSync(file) && statSync(file).size > 5_000_000) renameSync(file, file + '.1')
    appendFileSync(file, line + '\n')
  } catch {
    // logging must never crash the app
  }
  if (process.env.AUTBOT_LOG_STDOUT) console.log(line)
}

export const log = {
  info: (msg: string, extra?: unknown) => write('INFO', msg, extra),
  warn: (msg: string, extra?: unknown) => write('WARN', msg, extra),
  error: (msg: string, extra?: unknown) => write('ERROR', msg, extra)
}

export function readLogs(): string {
  try {
    return redact(readFileSync(logFile(), 'utf8'))
  } catch {
    return ''
  }
}
