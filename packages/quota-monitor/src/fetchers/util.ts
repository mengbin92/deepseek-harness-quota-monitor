/**
 * Coerce a decoded JSON value to a finite number. Numeric strings are
 * accepted (`"42.50"`), but empty or blank strings are not — `Number('')`
 * would silently read as 0 and a missing balance would render as an empty
 * wallet.
 */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * Read a numeric field out of an arbitrary JSON document by dotted path.
 * Array segments are written as numeric path components (`data.0.balance`).
 *
 * @param doc - decoded JSON document.
 * @param path - dotted path such as `data.balance`; empty returns undefined.
 * @returns the number at the path, or undefined when absent or not numeric.
 */
export function readPath(doc: unknown, path: string | undefined): number | undefined {
  if (!path) return undefined
  let node: unknown = doc
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return toNumber(node)
}

/** Read a string field by dotted path, for currency tags. */
export function readPathString(doc: unknown, path: string | undefined): string | undefined {
  if (!path) return undefined
  let node: unknown = doc
  for (const segment of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * Fetch a JSON document with timeout and credential header wiring shared by
 * the built-in fetchers.
 */
export async function fetchJson(
  url: string,
  options: { apiKey?: string; headers?: Record<string, string>; signal: AbortSignal },
): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers }
  if (options.apiKey && !Object.keys(headers).some((name) => name.toLowerCase() === 'authorization')) {
    headers['authorization'] = `Bearer ${options.apiKey}`
  }
  const response = await fetch(url, { headers, signal: options.signal })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`)
  }
  return (await response.json()) as unknown
}

/** Join a base URL and a path exactly once at the boundary. */
export function joinUrl(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}
