import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { idsFromEnvFile, PLACEHOLDER_IDS, withDatabaseIds } from './d1-ids.ts'

const config = readFileSync(
  join(import.meta.dirname, '..', 'apps', 'api', 'wrangler.jsonc'),
  'utf8',
)
const PROD = '11111111-2222-4333-8444-555555555555'
const PREVIEW = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('D1 database ids from deploy-time variables', () => {
  it('commits only the placeholders, once each', () => {
    const ids = [...config.matchAll(/"database_id":\s*"([^"]+)"/g)].map((m) => m[1])
    expect(ids).toEqual([PLACEHOLDER_IDS.production, PLACEHOLDER_IDS.preview])
  })

  it('puts each id in its own environment and leaves the rest of the file as is', () => {
    const out = withDatabaseIds(config, { production: PROD, preview: PREVIEW })
    expect(out).toContain(`"database_id": "${PROD}"`)
    expect(out).toContain(`"database_id": "${PREVIEW}"`)
    expect(out.indexOf(PROD)).toBeLessThan(out.indexOf('"preview": {'))
    expect(out.indexOf(PREVIEW)).toBeGreaterThan(out.indexOf('"preview": {'))
    expect(
      out.replace(PROD, PLACEHOLDER_IDS.production).replace(PREVIEW, PLACEHOLDER_IDS.preview),
    ).toBe(config)
  })

  it('can set one environment only', () => {
    const out = withDatabaseIds(config, { preview: PREVIEW })
    expect(out).toContain(`"database_id": "${PLACEHOLDER_IDS.production}"`)
    expect(out).toContain(`"database_id": "${PREVIEW}"`)
  })

  it('refuses a value that is not a D1 id', () => {
    for (const bad of ['', 'frailty-prod', `${PROD}"`, `${PROD}\n`]) {
      expect(() => withDatabaseIds(config, { production: bad }), JSON.stringify(bad)).toThrow(
        /not a D1 database id/,
      )
    }
  })

  it('refuses a config without the placeholder (already substituted, or edited)', () => {
    const once = withDatabaseIds(config, { production: PROD })
    expect(() => withDatabaseIds(once, { production: PROD })).toThrow(/placeholder/)
  })

  it('reads only the D1 ids from the local env file, never the token', () => {
    const file = [
      'CLOUDFLARE_API_TOKEN=secret-token',
      'CLOUDFLARE_ACCOUNT_ID=abc',
      `D1_PREVIEW_DATABASE_ID=${PREVIEW}`,
    ].join('\n')
    expect(idsFromEnvFile(file)).toEqual({ preview: PREVIEW })
    expect(idsFromEnvFile(`${file}\nD1_PRODUCTION_DATABASE_ID=${PROD}\n`)).toEqual({
      preview: PREVIEW,
      production: PROD,
    })
    expect(idsFromEnvFile('CLOUDFLARE_API_TOKEN=x')).toEqual({})
  })
})
