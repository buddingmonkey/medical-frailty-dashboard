import { describe, expect, it } from 'vitest'

import { qualificationBases, qualifications } from './enums'
import { qualificationBasisLabels, qualificationHelp, qualificationLabels } from './qualification'

describe('qualification labels', () => {
  it('has a label and help text for every value, so no badge renders blank', () => {
    for (const q of qualifications) {
      expect(qualificationLabels[q].length).toBeGreaterThan(0)
      expect(qualificationHelp[q].length).toBeGreaterThan(0)
    }
    for (const b of qualificationBases)
      expect(qualificationBasisLabels[b].length).toBeGreaterThan(0)
  })
})
