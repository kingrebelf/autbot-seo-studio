/**
 * An error whose message is safe to show to a non-technical user. Every message says
 * what went wrong and what to do next.
 */
export class UserError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'user_error'
  ) {
    super(message)
    this.name = 'UserError'
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled.')
    this.name = 'CancelledError'
  }
}

export function isAbort(err: unknown): boolean {
  return (
    err instanceof CancelledError ||
    (err instanceof Error &&
      (err.name === 'AbortError' || (/aborted|cancel/i.test(err.message) && err.name !== 'UserError')))
  )
}

/** Turn any error into a plain-English message with a next step. */
export function friendlyMessage(err: unknown): string {
  if (err instanceof UserError) return err.message
  if (isAbort(err)) return 'Cancelled. You can start it again whenever you like.'
  const msg = err instanceof Error ? err.message : String(err)
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : ''
  const all = `${msg} ${cause}`
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(all))
    return "Couldn't reach the internet address. Check your internet connection and that the web address is spelled correctly, then try again."
  if (/ECONNREFUSED/i.test(all))
    return 'The service refused the connection. Make sure it is running (for local AI, open Ollama or LM Studio) and try again.'
  if (/ETIMEDOUT|timeout|timed out/i.test(all))
    return 'The request took too long and timed out. Check your connection and try again in a minute.'
  if (/certificate|SSL|TLS/i.test(all))
    return "There was a security certificate problem connecting to the site. Make sure the address starts with https:// and the site's certificate is valid."
  if (/SQLITE_BUSY|database is locked/i.test(all))
    return 'The app database was busy. Wait a moment and try again.'
  if (/ENOSPC/i.test(all)) return 'Your disk is full. Free up some space and try again.'
  if (/EACCES|EPERM/i.test(all))
    return "The app wasn't allowed to read or write a file. Check the folder's permissions, or pick a different folder."
  return 'Something went wrong. Try again; if it keeps happening, use Settings > About > Export logs and report the problem.'
}
