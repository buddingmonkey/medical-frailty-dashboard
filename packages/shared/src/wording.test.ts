import { describe, expect, it } from 'vitest'

import { federalCategoryClauseText, federalCategoryInfo } from './categories'
import {
  CODE_DETAIL_CONFIRMED,
  CODE_DETAIL_NOT_FOUND,
  CODE_DETAIL_OTHERS,
  codeDetailTitle,
} from './code-detail'
import {
  COMPARE_HEADING,
  compareLegend,
  compareStatusLabels,
  descriptionSourceText,
} from './compare'
import { CATEGORIES_HEADING, CATEGORIES_INTRO } from './compare-tabs'
import {
  DRILL_COUNT_NOTE,
  drillCountText,
  drillGroupCountText,
  drillRuleText,
  drillShowLabels,
  drillUniverseNote,
} from './drill'
import {
  OVERVIEW_HEADING,
  overviewReadingNotes,
  OVERVIEW_NOT_REVIEWED,
  overviewOrderAnnouncement,
} from './overview'
import {
  FOOTER_TEXT,
  HOME_INTRO,
  pageTitles,
  stateCategoriesIntro,
  statesWithListText,
} from './public'
import { qualificationBasisLabels, qualificationHelp, qualificationLabels } from './qualification'
import {
  STATES_COMPARE_BASIS_NOTE,
  STATES_COMPARE_INTRO,
  STATES_COMPARE_NONE_LABEL,
  statesCompareAllLabel,
  statesCompareOnlyLabel,
} from './states-compare'
import { TILE_MAP_HEADING, TILE_MAP_INTRO, TILE_MAP_NONE } from './tile-map'

// The plain-language pass (M6 step 3b): public words say what the data is (what a state's list
// includes), never that a code "covers" a member or that a member "qualifies"; every number
// says what it counts. On the legal review list (docs/legal-review.md, Part 2).

describe('public wording', () => {
  it('describes the state’s rule, not a member’s eligibility', () => {
    expect(qualificationLabels.standalone).toBe('Enough by itself')
    expect(qualificationHelp.standalone).not.toMatch(/claim/)
    expect(qualificationBasisLabels.inferred).toMatch(/this site/)
    for (const text of [...Object.values(qualificationLabels), ...Object.values(qualificationHelp)])
      expect(text).not.toMatch(/qualif/i)
  })

  it('never says "cover" for what a list includes in headings and titles', () => {
    expect(OVERVIEW_HEADING).not.toMatch(/cover/i)
    expect(pageTitles.overview).not.toMatch(/cover/i)
    expect(overviewOrderAnnouncement({ by: 'similar' }, [])).not.toMatch(/coverage/)
    expect(overviewOrderAnnouncement({ by: 'overall', dir: 'desc' }, [])).toMatch(/average/)
  })

  it('says the overview share counts billable ICD-10-CM codes only', () => {
    const [first] = overviewReadingNotes
    expect(first).toMatch(/billable ICD-10-CM/)
    expect(first).toMatch(/CPT/)
    expect(overviewReadingNotes.join(' ')).toMatch(/plain average/)
    expect(TILE_MAP_INTRO).toMatch(/no reference list/)
  })

  it('says what "n of N" counts: states that include it, out of states with a list', () => {
    expect(drillCountText(3, 4)).toBe('3 of 4 states')
    expect(drillGroupCountText(2, 4)).toBe('2 of 4 include any')
    expect(DRILL_COUNT_NOTE).toMatch(/wildcard or range/)
    expect(DRILL_COUNT_NOTE).toMatch(/with a list on this site/)
    expect(drillShowLabels.everyone).toBe('Included by every state with a list')
    expect(drillRuleText({ qualification: 'standalone', count: 3, inferred: 1 })).toBe(
      'Enough by itself: 3 states (1 inferred)',
    )
    expect(drillUniverseNote(158)).toMatch(/reference list/)
    expect(drillUniverseNote(0)).not.toMatch(/full code list/i)
  })

  it('names the site’s own categories "comparison categories"', () => {
    expect(CATEGORIES_HEADING).toBe('Comparison categories')
    expect(CATEGORIES_INTRO).toMatch(/this site’s own grouping/)
    expect(STATES_COMPARE_NONE_LABEL).toBe('Not in any comparison category')
    expect(stateCategoriesIntro('Georgia')).toMatch(/comparison category/)
    expect(stateCategoriesIntro('Georgia')).not.toMatch(/\bour\b|\bwe\b/)
  })

  it('labels the two federal categories that are not in the law', () => {
    expect(federalCategoryInfo.unmapped.label).toBe('Not yet classified')
    expect(federalCategoryInfo.unmapped.statuteText).not.toMatch(/admin/)
    expect(federalCategoryInfo.state_specific.label).toBe('State’s own category (not in the law)')
    expect(federalCategoryClauseText('physical_idd_adl')).toMatch(/^Clause \(dd\) of the law: “/)
    expect(federalCategoryClauseText('unmapped')).toBeNull()
  })

  it('states the state-comparison rules, including the "State doesn’t say" rule', () => {
    expect(STATES_COMPARE_INTRO).toMatch(/not treated as a difference/)
    expect(STATES_COMPARE_BASIS_NOTE).toMatch(/different basis/)
    expect(statesCompareOnlyLabel('Georgia')).toBe('Only Georgia includes')
    expect(statesCompareAllLabel(2)).toBe('Both include')
    expect(statesCompareAllLabel(3)).toBe('All 3 include')
  })

  it('gives the home page and footer context and a disclaimer', () => {
    expect(HOME_INTRO).toMatch(/does not decide anyone’s eligibility/)
    expect(FOOTER_TEXT).toMatch(/No patient data/)
    expect(FOOTER_TEXT).toMatch(/eligibility/)
    expect(statesWithListText(4)).toBe('4 of the 50 states and DC have a list on this site.')
    expect(pageTitles.home).toMatch(/medical frailty code lists/)
  })

  it('keeps one name for the single-code page and the map', () => {
    expect(COMPARE_HEADING).toBe('Compare single codes')
    expect(pageTitles.compare).toMatch(/^Compare single codes/)
    expect(TILE_MAP_HEADING).toBe('One category, every state')
    expect(TILE_MAP_NONE).toBe('None')
    expect(OVERVIEW_NOT_REVIEWED).toBe('not yet reviewed')
  })

  it('explains every cell status in the legend', () => {
    const terms = compareLegend.map((l) => l.term)
    for (const label of Object.values(compareStatusLabels)) expect(terms).toContain(label)
    expect(descriptionSourceText('Georgia')).toBe('As published by Georgia')
  })

  it('does not reuse "Confirmed" (a mapping word) on the code page', () => {
    expect(CODE_DETAIL_CONFIRMED.heading).toBe('Included')
    expect(CODE_DETAIL_OTHERS.heading).toBe('Not included')
    expect(codeDetailTitle('F20.0')).toMatch(/^F20\.0: which states include it/)
    expect(CODE_DETAIL_NOT_FOUND.body).not.toMatch(/\bwe\b/)
  })
})
