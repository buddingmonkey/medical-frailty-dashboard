import { describe, expect, it } from 'vitest'

import {
  addDays,
  groupWatchItems,
  nextRepeatDate,
  watchCreateSchema,
  watchListQuerySchema,
  watchUpdateSchema,
} from './watch'

const valid = {
  title: 'Mass. v. Oz appeal deadline',
  kind: 'court',
  dueDate: '2026-12-28',
  dateIsApproximate: true,
  whyMd: 'An appeal may change the ruling note.',
  links: [{ label: 'Opinion', url: 'https://example.org/opinion.pdf' }],
}

describe('watchCreateSchema', () => {
  it('fills defaults for the optional fields', () => {
    expect(
      watchCreateSchema.parse({
        title: ' Re-check NE ',
        kind: 'state_list',
        whyMd: 'Lists change.',
      }),
    ).toEqual({
      title: 'Re-check NE',
      kind: 'state_list',
      stateId: null,
      dueDate: null,
      dateIsApproximate: false,
      whyMd: 'Lists change.',
      links: [],
      repeatDays: null,
    })
  })

  it('accepts a full item', () => {
    expect(watchCreateSchema.parse({ ...valid, stateId: 'LA', repeatDays: 90 })).toMatchObject({
      stateId: 'LA',
      repeatDays: 90,
    })
  })

  it.each([
    ['empty title', { title: '  ' }],
    ['unknown kind', { kind: 'gossip' }],
    ['bad date', { dueDate: '2026-13-01' }],
    ['lower-case state', { stateId: 'la' }],
    ['empty why', { whyMd: '' }],
    ['zero repeat', { repeatDays: 0 }],
    ['javascript: link', { links: [{ label: 'x', url: 'javascript:alert(1)' }] }],
    ['data: link', { links: [{ label: 'x', url: 'data:text/html,hi' }] }],
    ['link without label', { links: [{ label: '', url: 'https://example.org' }] }],
  ])('rejects %s', (_name, patch) => {
    expect(watchCreateSchema.safeParse({ ...valid, ...patch }).success).toBe(false)
  })
})

describe('watchUpdateSchema', () => {
  it('accepts an edit with every field', () => {
    expect(watchUpdateSchema.parse({ action: 'edit', ...valid }).action).toBe('edit')
  })

  it('needs a resolution note to close', () => {
    expect(
      watchUpdateSchema.safeParse({ action: 'close', status: 'done', resolutionMd: ' ' }).success,
    ).toBe(false)
    expect(
      watchUpdateSchema.parse({ action: 'close', status: 'dismissed', resolutionMd: 'No appeal.' }),
    ).toEqual({ action: 'close', status: 'dismissed', resolutionMd: 'No appeal.' })
  })

  it('cannot close back to open', () => {
    expect(
      watchUpdateSchema.safeParse({ action: 'close', status: 'open', resolutionMd: 'x' }).success,
    ).toBe(false)
  })
})

describe('watchListQuerySchema', () => {
  it('defaults to open items and accepts closed', () => {
    expect(watchListQuerySchema.parse({})).toEqual({ status: 'open' })
    expect(watchListQuerySchema.parse({ status: 'closed' })).toEqual({ status: 'closed' })
    expect(watchListQuerySchema.safeParse({ status: 'done' }).success).toBe(false)
  })
})

describe('addDays', () => {
  it('crosses month and year ends and leap days', () => {
    expect(addDays('2026-12-28', 14)).toBe('2027-01-11')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-11-01', 0)).toBe('2026-11-01')
  })
})

describe('groupWatchItems', () => {
  const item = (id: number, dueDate: string | null) => ({ id, dueDate })
  const today = '2026-11-01'

  it('groups by due date, with the 14-day edge in "due soon", each sorted by date', () => {
    const groups = groupWatchItems(
      [
        item(1, '2026-12-28'),
        item(2, null),
        item(3, '2026-10-31'),
        item(4, '2026-11-15'),
        item(5, '2026-11-16'),
        item(6, '2026-11-01'),
        item(7, '2026-11-10'),
        item(8, null),
      ],
      today,
    )
    const ids = (list: { id: number }[]) => list.map((i) => i.id)
    expect(ids(groups.overdue)).toEqual([3])
    expect(ids(groups.dueSoon)).toEqual([6, 7, 4])
    expect(ids(groups.later)).toEqual([5, 1])
    expect(ids(groups.noDate)).toEqual([2, 8])
  })
})

describe('nextRepeatDate', () => {
  it('repeats from the due date when closed on time', () => {
    expect(nextRepeatDate('2026-11-30', '2026-11-28', 90)).toBe('2027-02-28')
  })

  it('repeats from the close date when the next date would already have passed', () => {
    expect(nextRepeatDate('2026-01-01', '2026-11-01', 30)).toBe('2026-12-01')
  })

  it('repeats from the close date when there was no due date', () => {
    expect(nextRepeatDate(null, '2026-11-01', 7)).toBe('2026-11-08')
  })
})
