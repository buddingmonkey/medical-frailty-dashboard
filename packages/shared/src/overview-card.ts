import {
  type OverviewCategory,
  type OverviewCell,
  overviewCellNotReviewed,
  overviewCellText,
} from './overview'
import { formatCount } from './public'

// The hover card on an overview matrix cell (`/compare`): what the cell's number means, in
// words, from the fields the overview already sends. The cell's `aria-label`
// (`overviewCellLabel`) stays its accessible name; the card adds detail for people who pause.

/** What each matrix cell hands the shared card. */
export interface OverviewCellCardPayload {
  stateName: string
  category: OverviewCategory
  cell: OverviewCell
}

export interface OverviewCellCard {
  state: string
  category: string
  /** The number the cell shows, like "42%". */
  share: string
  /** What the share is of, by the category's coverage basis. */
  covered: string
  /** The state's entries in the category and how many are enough by themselves. */
  entries: string
  /** Whether every placement was reviewed; null when there are no entries. */
  review: string | null
  hint: string
}

export const OVERVIEW_CARD_HINT = 'Select the number to see the codes'

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

function coveredText(category: OverviewCategory, cell: OverviewCell): string {
  const d = category.denominator
  if (category.coverageBasis === 'universe') {
    if (d === 0) return 'The category has no diagnosis codes to count yet'
    const covered = cell.covered === 0 ? 'none' : formatCount(cell.covered)
    return `Covers ${covered} of the category’s ${formatCount(d)} ${plural(d, 'diagnosis code', 'diagnosis codes')}`
  }
  if (d === 0) return 'No state lists an entry here yet'
  return `${formatCount(cell.covered)} of the ${formatCount(d)} distinct ${plural(d, 'entry', 'entries')} any state lists here`
}

function entriesText(cell: OverviewCell): string {
  if (cell.entries === 0) return 'No entries placed here'
  const placed = `${formatCount(cell.entries)} ${plural(cell.entries, 'entry', 'entries')} placed here`
  const q = cell.qualifiesAlone
  if (q === 0) return `${placed}; none is enough by itself`
  const alone = plural(q, 'is enough by itself', 'are enough by themselves')
  return `${placed}; ${formatCount(q)} ${alone} (${overviewCellText(cell.qualifiesAloneShare)})`
}

function reviewText(cell: OverviewCell): string | null {
  if (cell.entries === 0) return null
  if (overviewCellNotReviewed(cell))
    return 'Not yet reviewed: some entries were placed here automatically, by the CCSR group of their code'
  return 'Every placement here was reviewed'
}

export function overviewCellCard(
  stateName: string,
  category: OverviewCategory,
  cell: OverviewCell,
): OverviewCellCard {
  return {
    state: stateName,
    category: category.label,
    share: overviewCellText(cell.share),
    covered: coveredText(category, cell),
    entries: entriesText(cell),
    review: reviewText(cell),
    hint: OVERVIEW_CARD_HINT,
  }
}
