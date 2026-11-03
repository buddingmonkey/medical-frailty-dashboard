import type { D1Migration } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createDb } from './client'
import { appMeta, unifiedCategories } from './schema'

// Migration 0013 (M6 step 3b): rewords migration 0011's starter categories, but only the fields
// that still hold 0011's exact text, so an admin's edit is never overwritten.

const { TEST_MIGRATIONS } = env as Env & { TEST_MIGRATIONS: D1Migration[] }
const reword = TEST_MIGRATIONS.find((m) => m.name.startsWith('0013_'))

async function category(slug: string) {
  const [row] = await createDb(env.DB)
    .select()
    .from(unifiedCategories)
    .where(eq(unifiedCategories.slug, slug))
  if (!row) throw new Error(`no category ${slug}`)
  return row
}

/** Runs 0013's statements again, as on a database that applied 0011 earlier. */
async function runReword() {
  if (!reword) throw new Error('migration 0013 not found')
  await env.DB.batch(reword.queries.map((q) => env.DB.prepare(q)))
}

describe('migration 0013: plain-language starter categories', () => {
  it('rewords the starter categories still holding 0011’s text', async () => {
    const smi = await category('serious-mental-illness')
    expect(smi.definition).toMatch(/^What this site groups as serious mental illness/)
    expect(smi.includes).toMatch(/^Diagnosis groups \(CCSR\): schizophrenia/)
    expect(smi.version).toBe(2)
    expect(smi.updatedBy).toBe('migration 0013')
    expect((await category('kidney-failure')).label).toBe(
      'Chronic kidney disease and kidney failure',
    )
    expect((await category('organ-transplant')).definition).not.toMatch(/People/)
    expect((await category('frailty-indicators')).definition).not.toMatch(/Tier 2|CCSR/)
  })

  it('keeps a field an admin edited, and changes only the fields still at 0011’s text', async () => {
    const db = createDb(env.DB)
    // As on production before 0013: 0011's label, and a definition the project lead wrote.
    await db
      .update(unifiedCategories)
      .set({
        label: 'Kidney failure and dialysis',
        definition: 'Edited by an admin.',
        includes: 'CCSR: chronic kidney disease.',
        version: 3,
      })
      .where(eq(unifiedCategories.slug, 'kidney-failure'))
    await db
      .update(unifiedCategories)
      .set({ definition: 'Our own SMI words.', version: 5 })
      .where(eq(unifiedCategories.slug, 'serious-mental-illness'))
    const [before] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))

    await runReword()

    const kidney = await category('kidney-failure')
    expect(kidney.label).toBe('Chronic kidney disease and kidney failure')
    expect(kidney.includes).toBe('Diagnosis groups (CCSR): chronic kidney disease.')
    expect(kidney.definition).toBe('Edited by an admin.')
    expect(kidney.version).toBe(4)
    // Nothing left at 0011's text: untouched, version and all.
    const smi = await category('serious-mental-illness')
    expect(smi.definition).toBe('Our own SMI words.')
    expect(smi.version).toBe(5)
    const [after] = await db.select().from(appMeta).where(eq(appMeta.key, 'data_version'))
    expect(Number(after?.value)).toBe(Number(before?.value ?? 0) + 1)
  })
})
