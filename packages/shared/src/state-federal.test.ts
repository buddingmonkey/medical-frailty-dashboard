import { describe, expect, it } from 'vitest'

import {
  decodeStateFederal,
  encodeStateFederal,
  parseStateFederalCell,
  stateFederalCategoriesSchema,
} from './state-federal'

describe('parseStateFederalCell', () => {
  it('reads each of the five labels Indiana publishes', () => {
    expect(parseStateFederalCell('Serious or complex medical condition')).toEqual({
      categories: ['serious_complex_medical'],
      unknown: [],
    })
    expect(parseStateFederalCell('Physical, intellectual or developmental disability')).toEqual({
      categories: ['physical_idd_adl'],
      unknown: [],
    })
    expect(parseStateFederalCell('Substance use disorder').categories).toEqual(['sud'])
    expect(parseStateFederalCell('Blind or disabled').categories).toEqual(['blind_or_disabled'])
    expect(parseStateFederalCell('Disabling mental disorder').categories).toEqual([
      'disabling_mental_disorder',
    ])
  })

  it('ignores case, punctuation and extra spaces, and reads the law’s own words', () => {
    expect(parseStateFederalCell('  SUBSTANCE-USE  disorder. ').categories).toEqual(['sud'])
    expect(
      parseStateFederalCell('physical intellectual & developmental disabilities').categories,
    ).toEqual(['physical_idd_adl'])
    expect(parseStateFederalCell('with a serious or complex medical condition').categories).toEqual(
      ['serious_complex_medical'],
    )
    expect(
      parseStateFederalCell('Blind or disabled (as defined in section 1614)').categories,
    ).toEqual(['blind_or_disabled'])
  })

  it('splits two categories on “;”, in federal order, each once', () => {
    expect(
      parseStateFederalCell(
        'Physical, intellectual or developmental disability; Serious or complex medical condition',
      ),
    ).toEqual({ categories: ['physical_idd_adl', 'serious_complex_medical'], unknown: [] })
    expect(
      parseStateFederalCell('Serious or complex medical condition;Substance use disorder; sud')
        .categories,
    ).toEqual(['sud', 'serious_complex_medical'])
  })

  it('reads an empty cell as none', () => {
    expect(parseStateFederalCell('')).toEqual({ categories: [], unknown: [] })
    expect(parseStateFederalCell(' ; ')).toEqual({ categories: [], unknown: [] })
  })

  it('returns text it does not know, and never our own two categories', () => {
    expect(parseStateFederalCell('Frailty indicators; Substance use disorder')).toEqual({
      categories: ['sud'],
      unknown: ['Frailty indicators'],
    })
    expect(parseStateFederalCell('Not yet classified').unknown).toEqual(['Not yet classified'])
    expect(parseStateFederalCell('state_specific').unknown).toEqual(['state_specific'])
  })
})

describe('encodeStateFederal and decodeStateFederal', () => {
  it('stores the enum values joined by commas, null for none', () => {
    expect(encodeStateFederal(['sud', 'serious_complex_medical'])).toBe(
      'sud,serious_complex_medical',
    )
    expect(encodeStateFederal([])).toBeNull()
    expect(decodeStateFederal('sud,serious_complex_medical')).toEqual([
      'sud',
      'serious_complex_medical',
    ])
    expect(decodeStateFederal(null)).toEqual([])
    expect(decodeStateFederal('')).toEqual([])
  })

  it('drops values that are not law categories when reading', () => {
    expect(decodeStateFederal('unmapped,sud,nonsense')).toEqual(['sud'])
  })
})

describe('stateFederalCategoriesSchema', () => {
  it('accepts the five law categories, each once', () => {
    expect(stateFederalCategoriesSchema.safeParse(['sud', 'blind_or_disabled']).success).toBe(true)
    expect(stateFederalCategoriesSchema.safeParse(['unmapped']).success).toBe(false)
    expect(stateFederalCategoriesSchema.safeParse(['state_specific']).success).toBe(false)
    expect(stateFederalCategoriesSchema.safeParse(['sud', 'sud']).success).toBe(false)
  })
})
