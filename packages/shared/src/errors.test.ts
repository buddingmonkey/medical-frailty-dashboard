import { describe, expect, it } from 'vitest'

import {
  adminErrorMessage,
  classifyServerError,
  errorBodySchema,
  errorReferenceSchema,
  isRetryableServerError,
} from './errors'

describe('classifyServerError', () => {
  it('knows the D1 failures an admin can hit', () => {
    expect(classifyServerError('D1_ERROR: D1 DB exceeded its CPU time limit and was reset.')).toBe(
      'too-long',
    )
    expect(
      classifyServerError(
        'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.',
      ),
    ).toBe('too-long')
    expect(
      classifyServerError('D1_ERROR: too many SQL variables at offset 412: SQLITE_ERROR'),
    ).toBe('too-many-values')
    expect(
      classifyServerError('D1_ERROR: D1 DB is overloaded. Requests queued for too long.'),
    ).toBe('busy')
    expect(classifyServerError('D1_ERROR: Network connection lost.')).toBe('busy')
    expect(
      classifyServerError(
        'D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window',
      ),
    ).toBe('busy')
  })

  it('leaves everything else unknown', () => {
    expect(classifyServerError('Cannot read properties of undefined')).toBe('unknown')
    expect(classifyServerError('')).toBe('unknown')
  })
})

describe('adminErrorMessage', () => {
  it('says what happened, what to do, and the reference', () => {
    expect(adminErrorMessage('too-long', '8f2a1c3d4e5f6a7b-DFW')).toBe(
      'The database took too long on this step and stopped it. Nothing was saved from the unfinished step. Try again; if it keeps failing, report it with reference 8f2a1c3d4e5f6a7b-DFW.',
    )
    for (const kind of ['too-many-values', 'busy', 'unknown'] as const) {
      expect(adminErrorMessage(kind, 'ab12cd34')).toMatch(/reference ab12cd34\.$/)
    }
  })
})

describe('retryable errors', () => {
  it('retries only a busy database', () => {
    expect(isRetryableServerError('busy')).toBe(true)
    for (const kind of ['too-long', 'too-many-values', 'unknown'] as const) {
      expect(isRetryableServerError(kind)).toBe(false)
    }
  })

  it('does not promise that nothing was saved when busy, since a retry follows', () => {
    expect(adminErrorMessage('busy', 'ab12cd34')).toBe(
      'The database was busy, or the connection to it dropped. Earlier steps are saved; the unfinished one will redo safely. Wait a minute and try again; if it keeps failing, report it with reference ab12cd34.',
    )
  })

  it('reads the error body, with retryable only as true', () => {
    expect(errorBodySchema.parse({ error: 'x', retryable: true })).toEqual({
      error: 'x',
      retryable: true,
    })
    expect(errorBodySchema.parse({ error: 'x' })).toEqual({ error: 'x' })
    expect(errorBodySchema.safeParse({ error: 'x', retryable: false }).success).toBe(false)
  })
})

describe('errorReferenceSchema', () => {
  it('takes a cf-ray value or a short id, and nothing that could carry other text', () => {
    expect(errorReferenceSchema.safeParse('8f2a1c3d4e5f6a7b-DFW').success).toBe(true)
    expect(errorReferenceSchema.safeParse('ab12cd34').success).toBe(true)
    expect(errorReferenceSchema.safeParse('a b').success).toBe(false)
    expect(errorReferenceSchema.safeParse('x'.repeat(65)).success).toBe(false)
  })
})
