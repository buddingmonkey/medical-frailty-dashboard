import { conditionMemberText, parseConditionMember } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { conditionGroups, conditionMembers } from '../../db/schema'

// The starter condition groups (migration 0014). Storage is fresh per test file, so this file
// sees the migrations' rows; it never calls resetDb.
const db = createDb(env.DB)

describe('migration 0014: starter condition groups', () => {
  it('seeds eight draft groups, each spanning more than one code system', async () => {
    const groups = await db.select().from(conditionGroups)
    const members = await db.select().from(conditionMembers)
    expect(groups.map((g) => g.slug).sort()).toEqual([
      'cancer',
      'hemophilia',
      'hiv',
      'kidney-failure-dialysis',
      'multiple-sclerosis',
      'organ-transplant',
      'serious-mental-illness',
      'substance-use-disorder',
    ])
    for (const g of groups) {
      expect(g.status, g.slug).toBe('draft')
      expect(g.sources, g.slug).toContain('First draft by an AI assistant')
      const systems = new Set(members.filter((m) => m.groupId === g.id).map((m) => m.codeSystem))
      expect(systems.size, g.slug).toBeGreaterThan(1)
    }
  })

  it('stores every member as the editor would parse it', async () => {
    const members = await db.select().from(conditionMembers)
    expect(members.length).toBeGreaterThan(50)
    for (const row of members) {
      const m = {
        codeSystem: row.codeSystem,
        matchKind: row.matchKind,
        codeNorm: row.codeNorm,
        rangeEndNorm: row.rangeEndNorm,
      }
      const text = conditionMemberText(m)
      expect(parseConditionMember({ codeSystem: m.codeSystem, text }), text).toEqual({
        ok: true,
        members: [m],
      })
    }
  })
})
