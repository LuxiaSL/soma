import { describe, it, expect } from 'vitest'
import { parse as yamlParse } from 'yaml'
import { redactConfig, redactString, redactValue, isSecretKey, REDACTED } from './redact.js'

describe('isSecretKey', () => {
  it('flags credential-ish key names in any casing or separator style', () => {
    for (const key of [
      'api_key', 'apiKey', 'API-KEY', 'PERPLEXITY_API_KEY', 'OpenAI_key',
      'token', 'api_token', 'discord_token', 'auth_token',
      'secret', 'client_secret', 'password', 'credentials', 'soma',
    ]) {
      expect(isSecretKey(key), key).toBe(true)
    }
  })

  it('leaves ordinary config keys alone', () => {
    for (const key of [
      'max_tokens', 'continuation_max_tokens', 'prompt_max_tokens', 'total_max_tokens',
      'turn_end_token', 'authorized_roles', 'steer_roles', 'temperature',
      'continuation_model', 'system_prompt', 'stop_sequences', 'tools_enabled',
    ]) {
      expect(isSecretKey(key), key).toBe(false)
    }
  })
})

describe('redactString', () => {
  it('redacts known credential formats', () => {
    for (const secret of [
      'sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF',
      'sk-proj-AAAABBBBCCCCDDDDEEEEFFFF',
      'pplx-EXAMPLEEXAMPLEEXAMPLEEXAMPLE000000000000',
      'patEXAMPLE000001.exampleexampleexampleexampleexample000000',
      'ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH',
      'AKIAIOSFODNN7EXAMPLE',
      'bu_EXAMPLEEXAMPLEEXAMPLEEXAMPLE00',
    ]) {
      expect(redactString(secret), secret).not.toContain(secret.slice(-12))
    }
  })

  it('redacts a bare high-entropy hex blob (the soma service token shape)', () => {
    expect(
      redactString('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
    ).toBe(REDACTED)
  })

  it('redacts a credential embedded in a CLI argument', () => {
    const arg = 'X-Browser-Use-API-Key: bu_EXAMPLEEXAMPLEEXAMPLEEXAMPLE00'
    const out = redactString(arg)
    expect(out).not.toContain('bu_EXAMPLEEXAMPLEEXAMPLEEXAMPLE00')
    expect(out).toContain('X-Browser-Use-API-Key')
  })

  it('redacts a token quoted inside a multi-line YAML parse error', () => {
    const parseError =
      'Map keys must be unique at line 7, column 1:\n\n' +
      '  token: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n  ^\n'
    const out = redactString(parseError)
    expect(out).not.toContain('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
    expect(out).toContain('Map keys must be unique at line 7')
  })

  it('redacts a Discord webhook URL', () => {
    const out = redactString('https://discord.com/api/webhooks/123456789012345678/abcDEF-ghiJKL_mno')
    expect(out).toBe(REDACTED)
  })

  it('leaves ordinary config values and prose intact', () => {
    for (const value of [
      'claude-opus-4-5-20251101',
      'http://localhost:3100/api/v1',
      'ws://localhost:8800/bot',
      'text-embedding-3-large',
      "The assistant is in CLI simulation mode, and responds to the user's CLI commands only with the output of the command.",
      '###',
      'gpt-4o-audio-preview-2025-06-03',
    ]) {
      expect(redactString(value), value).toBe(value)
    }
  })
})

describe('redactConfig', () => {
  it('redacts secrets nested in maps, arrays and argv strings', () => {
    const config = yamlParse(`
name: StrangeSonnet4.5
temperature: 0.9
max_tokens: 4096
turn_end_token: "###"
authorized_roles:
  - loom-operator
soma:
  enabled: true
  url: "http://localhost:3100/api/v1"
  token: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
airtable:
  base_id: appEXAMPLE0000001
  api_token: patEXAMPLE000001.exampleexampleexampleexampleexample000000
tts_relay:
  enabled: false
  url: "ws://localhost:8800/bot"
  token: "dev-bot-token"
mcp_servers:
  - name: perplexity
    command: npx
    args: ["-y", "@perplexity-ai/mcp-server"]
    env:
      PERPLEXITY_API_KEY: "pplx-EXAMPLEEXAMPLEEXAMPLEEXAMPLE000000000000"
  - name: browser-use
    command: npx
    args: ["mcp-remote", "https://api.browser-use.com/mcp", "--header", "X-Browser-Use-API-Key: bu_EXAMPLEEXAMPLEEXAMPLEEXAMPLE00"]
OpenAI_key: sk-proj-AAAABBBBCCCCDDDDEEEEFFFFGGGG
`) as Record<string, unknown>

    const dump = JSON.stringify(redactConfig(config))

    for (const secret of [
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'patEXAMPLE000001',
      'dev-bot-token',
      'pplx-EXAMPLEEXAMPLEEXAMPLEEXAMPLE000000000000',
      'bu_EXAMPLEEXAMPLEEXAMPLEEXAMPLE00',
      'sk-proj-AAAABBBBCCCCDDDDEEEEFFFFGGGG',
    ]) {
      expect(dump, secret).not.toContain(secret)
    }

    // ...while the parts that make the config readable survive.
    for (const kept of [
      'StrangeSonnet4.5', '0.9', '4096', '###', 'loom-operator',
      'perplexity', 'browser-use', 'appEXAMPLE0000001', 'mcp-remote',
    ]) {
      expect(dump, kept).toContain(kept)
    }
  })

  it('drops the whole soma block, not just its token', () => {
    const out = redactConfig({ soma: { enabled: true, url: 'http://localhost:3100/api/v1' } })
    expect(out.soma).toBe(REDACTED)
  })

  it('rejects non-object input rather than passing it through', () => {
    expect(() => redactConfig(null as unknown as Record<string, unknown>)).toThrow(TypeError)
    expect(() => redactConfig([] as unknown as Record<string, unknown>)).toThrow(TypeError)
  })

  it('survives cyclic structures from YAML anchors', () => {
    const node: Record<string, unknown> = { name: 'a' }
    node.self = node
    expect(() => redactConfig({ node })).not.toThrow()
  })

  it('keeps the same object appearing twice in sibling branches', () => {
    const shared = { format: 'irc' }
    const out = redactValue({ a: shared, b: shared }) as Record<string, unknown>
    expect(out.a).toEqual({ format: 'irc' })
    expect(out.b).toEqual({ format: 'irc' })
  })
})
