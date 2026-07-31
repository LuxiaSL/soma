/**
 * Credential redaction for config output
 *
 * Bot configs are handed to users over Discord (`/get_config`). They routinely
 * carry live credentials, and almost never at the top level:
 *
 *   soma.token                          64-hex service token
 *   airtable.api_token                  Airtable PAT
 *   mcp_servers[].env.PERPLEXITY_API_KEY  nested inside an array
 *   mcp_servers[].args[]                "X-Browser-Use-API-Key: bu_..." inside a string
 *   tts_relay.token                     relay bearer token
 *
 * So redaction has to be recursive, has to look at array elements, and has to
 * look at the *contents* of strings — not just key names.
 *
 * Three independent layers, any of which is sufficient to redact:
 *   1. Key name  — a key whose segments look credential-ish loses its whole subtree.
 *   2. Value shape — strings matching known key formats or high-entropy blobs.
 *   3. Inline    — `Header: <secret>` / `--key=<secret>` embedded in a larger string.
 *
 * Bias is deliberately toward over-redaction: a config that shows
 * `[REDACTED]` where a real value belonged is a nuisance; a leaked production
 * key in a Discord channel is an incident.
 */

/** Placeholder substituted for any withheld value. */
export const REDACTED = '[REDACTED]'

/** Placeholder for a self-referential structure (YAML anchors can produce these). */
const CIRCULAR = '[circular]'

/** Guard against pathological nesting blowing the stack. */
const MAX_DEPTH = 32

/**
 * Keys withheld wholesale regardless of their contents.
 *
 * `soma` is the credit-system integration block — url + service token. It is
 * never useful to a user debugging bot behaviour and always carries a secret.
 */
const DROP_KEYS: ReadonlySet<string> = new Set([
  'soma',
])

/**
 * Key-name segments that mark a value as a credential.
 *
 * Matched against *segments* (`max_tokens` -> `max`, `tokens`), not raw
 * substrings, so `authorized_roles` does not trip on `auth`.
 */
const SECRET_SEGMENTS: ReadonlySet<string> = new Set([
  'key', 'keys', 'apikey', 'apikeys',
  'token', 'tokens',
  'secret', 'secrets',
  'password', 'passwd', 'pwd',
  'credential', 'credentials', 'creds',
  'auth', 'authorization',
  'bearer',
  'cookie',
  'dsn',
])

/**
 * Config keys that contain a secret-looking segment but are plain settings.
 * Compared against the normalized key (lowercased, punctuation stripped).
 */
const SAFE_KEYS: ReadonlySet<string> = new Set([
  'maxtokens',
  'continuationmaxtokens',
  'promptmaxtokens',
  'totalmaxtokens',
  'turnendtoken',
  'maxtokenscount',
])

/**
 * Value patterns for well-known credential formats. Applied to any string,
 * including strings nested inside argv-style arrays, and redacted in place so
 * the surrounding text survives.
 */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g,                                   // OpenAI / Anthropic / OpenRouter
  /pplx-[A-Za-z0-9]{16,}/g,                                   // Perplexity
  /\bAIza[0-9A-Za-z_-]{35}\b/g,                               // Google API key
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,                            // GitHub token
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,                          // GitHub fine-grained PAT
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,                          // Slack
  /\bpat[A-Za-z0-9]{10,}\.[A-Za-z0-9]{32,}/g,                 // Airtable PAT
  /\bAKIA[0-9A-Z]{16}\b/g,                                    // AWS access key id
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[A-Za-z0-9_-]+/gi,
  /\b[A-Za-z0-9_-]{24,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/g, // Discord bot token
  /\b[a-z]{2,6}_[A-Za-z0-9]{24,}\b/g,                         // generic prefixed key: bu_, hf_, r8_, ...
  /\b[a-fA-F0-9]{32,}\b/g,                                    // hex digest/token embedded in a larger string
]

/**
 * `<credential-ish label><separator><value>` embedded in a single-line string.
 * Catches CLI args and HTTP headers, e.g.
 * `--header "X-Browser-Use-API-Key: bu_..."` or `--api-key=abc123`.
 */
const INLINE_ASSIGNMENT =
  /((?:api[-_ ]?key|access[-_ ]?key|secret|token|password|passwd|authorization|auth|bearer)[A-Za-z_-]*)(\s*[:=]\s*)(["']?)([^\s"',]{8,})\3/gi

/** Only scan for inline assignments in short single-line strings, so prose (system prompts) is left alone. */
const INLINE_SCAN_MAX_LENGTH = 200

/** Lowercase a key and strip punctuation: `PERPLEXITY_API_KEY` -> `perplexityapikey`. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Split a key into lowercase word segments across `_`, `-`, spaces and camelCase. */
function keySegments(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(segment => segment.toLowerCase())
}

/** True if this key's value should be withheld entirely, subtree and all. */
export function isSecretKey(key: string): boolean {
  const normalized = normalizeKey(key)
  if (DROP_KEYS.has(normalized)) return true
  if (SAFE_KEYS.has(normalized)) return false
  return keySegments(key).some(segment => SECRET_SEGMENTS.has(segment))
}

/**
 * True if the whole string looks like an opaque credential blob:
 * a long hex digest (the soma token is 64 hex chars) or a long mixed-case
 * base64-ish run. Whole-string only, so prose is never matched.
 */
function isHighEntropyBlob(value: string): boolean {
  if (/\s/.test(value)) return false
  if (/^[a-fA-F0-9]{32,}$/.test(value)) return true
  return (
    value.length >= 40 &&
    /^[A-Za-z0-9+/_=-]+$/.test(value) &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value)
  )
}

/**
 * Redact credential-looking spans inside an arbitrary string.
 *
 * Safe to call on error messages and free text — YAML parse errors quote the
 * offending source line, which is exactly how a secret escapes through an
 * error path.
 */
export function redactString(value: string): string {
  if (!value) return value

  if (isHighEntropyBlob(value)) return REDACTED

  let result = value
  for (const pattern of SECRET_VALUE_PATTERNS) {
    // Patterns are module-level and `g`-flagged; reset lastIndex before reuse.
    pattern.lastIndex = 0
    result = result.replace(pattern, REDACTED)
  }

  if (result.length <= INLINE_SCAN_MAX_LENGTH && !result.includes('\n')) {
    INLINE_ASSIGNMENT.lastIndex = 0
    result = result.replace(
      INLINE_ASSIGNMENT,
      (_match, label: string, separator: string, quote: string) =>
        `${label}${separator}${quote}${REDACTED}${quote}`,
    )
  }

  return result
}

/**
 * Recursively redact a parsed-YAML value.
 *
 * @param value - Any value produced by a YAML/JSON parse.
 * @param depth - Internal recursion depth.
 * @param seen  - Internal cycle guard (YAML anchors can produce shared/cyclic refs).
 */
export function redactValue(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactString(value)
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value
  }
  // Anything exotic (function, symbol) has no business in a config file.
  if (typeof value !== 'object') return REDACTED
  if (value instanceof Date) return value

  if (depth >= MAX_DEPTH) return REDACTED
  if (seen.has(value)) return CIRCULAR
  seen.add(value)

  try {
    if (Array.isArray(value)) {
      return value.map(item => redactValue(item, depth + 1, seen))
    }

    const source = value as Record<string, unknown>
    const output: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(source)) {
      output[key] = isSecretKey(key) ? REDACTED : redactValue(entry, depth + 1, seen)
    }
    return output
  } finally {
    // Allow the same object to appear in sibling branches; only reject true cycles.
    seen.delete(value)
  }
}

/**
 * Redact a parsed config object. Thin typed wrapper around {@link redactValue}.
 *
 * Throws only if the input is not an object — callers should treat a throw as
 * "do not send this config", never as "send it unredacted".
 */
export function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('redactConfig expects a plain object')
  }
  return redactValue(config) as Record<string, unknown>
}

/** True if a redacted value is (or contains only) the withheld marker. */
export function isRedacted(value: unknown): boolean {
  return value === REDACTED
}
