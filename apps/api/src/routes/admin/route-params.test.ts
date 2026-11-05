import { describe, expect, it } from 'vitest'

import { send } from '../../test/draft-fixtures'

// Admin route params (the review's duplication refactor, 2026-11-04): every numeric id is read by
// `idParamSchema` and every state by `stateIdSchema` (packages/shared/src/admin.ts), and a
// malformed one gets the same answer everywhere: 404 `Not found`, before any body is read.

const notFound = { status: 404, body: { error: 'Not found' } }

async function answer(method: string, path: string, body?: unknown) {
  const res = await send(method, path, body)
  const json: unknown = await res.json()
  return { status: res.status, body: json }
}

describe('malformed admin route params', () => {
  it.each([
    ['GET', '/api/admin/drafts/abc'],
    ['PUT', '/api/admin/drafts/1/sources/0'],
    ['POST', '/api/admin/drafts/1.5/rows'],
    ['GET', '/api/admin/drafts/-1/checks'],
    ['POST', '/api/admin/drafts/x/publish'],
    ['POST', '/api/admin/drafts/x/discard'],
    ['PUT', '/api/admin/sources/abc'],
    ['GET', '/api/admin/sources/0/file'],
    ['PUT', '/api/admin/unified/abc'],
    ['PUT', '/api/admin/condition-groups/1.5'],
    ['PUT', '/api/admin/watch/abc'],
  ])('%s %s (numeric id)', async (method, path) => {
    expect(await answer(method, path, method === 'GET' ? undefined : {})).toEqual(notFound)
  })

  it.each([
    ['GET', '/api/admin/states/ga/versions'],
    ['POST', '/api/admin/states/GAX/rollback'],
    ['GET', '/api/admin/states/g1/categories'],
    ['PUT', '/api/admin/states/ga/categories'],
    ['GET', '/api/admin/states/ga/unified-mappings'],
    ['PUT', '/api/admin/backup/mappings/ga'],
  ])('%s %s (state)', async (method, path) => {
    expect(await answer(method, path, method === 'GET' ? undefined : {})).toEqual(notFound)
  })
})
