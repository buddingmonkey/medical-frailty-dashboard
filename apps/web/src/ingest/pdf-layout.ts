import { guessColumnRoles, headerKey, MAX_COLUMNS, MAX_ROWS, type RawTable } from '@mfcd/shared'

import { ParseError } from './parse-error'

// Rebuilds tables from the text positions in a PDF (docs/ingestion.md, "PDF adapter").
// Pure: pdf.ts extracts the text items, this file turns them into rows.

/** One run of text as pdf.js places it. `y` is the baseline, in points from the page top. */
export interface PdfTextItem {
  text: string
  x: number
  y: number
  width: number
  height: number
  font: string
}

export interface PdfPageText {
  page: number
  items: PdfTextItem[]
}

/**
 * Where a wrapped cell's extra lines sit, relative to the line with the code. Excel prints
 * cells bottom-aligned by default ("above": GA, MT, NE); LA's file is top-aligned ("below").
 */
export type WrapDirection = 'above' | 'below'

export interface PdfLayoutOptions {
  name: string
  wrap: WrapDirection | 'auto'
}

export interface PdfLayoutResult {
  tables: RawTable[]
  /** The direction used: the one asked for, or the one detected. */
  wrap: WrapDirection
  /** Text before the first table (title lines, a contents page), for the state-name check. */
  titleText: string
}

/** Enough title text to name a state; a contents page can be long. */
const MAX_TITLE_TEXT = 2_000

/** Header runs closer than this many heights are one header cell ("Code" "Type"). */
const WORD_GAP = 0.5
/** The header is in the first lines of a page (after any title), above the first code. */
const HEADER_SEARCH_LINES = 10
/** At most this many header lines below the first (LA's "Code / Designation"). */
const MAX_HEADER_CONTINUATION = 2
const PAGE_NUMBER = /^(page\s+)?\d+(\s+of\s+\d+)?$/i
/** A code cell that ends like this continues on the next line ("33927, 33928,"). */
const CODE_JOINER = /([,\-–]|\band)$/i

/** A run of text on a line. Runs are never merged across columns: MT's truncated
 * `L89.500-L89` ends 1 pt before the next column starts. */
interface Run {
  text: string
  x: number
  end: number
  height: number
  font: string
}

interface Line {
  y: number
  height: number
  runs: Run[]
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

/** Header cells: runs closer than a word gap are one cell. */
function headerCells(runs: Run[]): { text: string; x: number; end: number }[] {
  const cells: { text: string; x: number; end: number }[] = []
  for (const run of runs) {
    const last = cells.at(-1)
    if (last && run.x - last.end < WORD_GAP * run.height) {
      last.text = joinRuns(last.text, last.end, run)
      last.end = Math.max(last.end, run.end)
    } else cells.push({ text: run.text, x: run.x, end: run.end })
  }
  return cells
}

/** Runs of one cell: a space unless the runs touch ("E1229" "-"). */
const joinRuns = (text: string, end: number, run: Run) =>
  run.x - end > 0.15 * run.height ? `${text} ${run.text}` : text + run.text

/** Clusters items by baseline: items within half a text height share a line. */
function toLines(items: PdfTextItem[]): Line[] {
  const visible = items
    .map((it) => ({ ...it, text: it.text.trim(), height: Math.max(it.height, 1) }))
    .filter((it) => it.text !== '')
    .sort((a, b) => a.y - b.y)
  const groups: PdfTextItem[][] = []
  for (const it of visible) {
    const group = groups.at(-1)
    const first = group?.[0]
    if (group && first && Math.abs(it.y - first.y) <= 0.5 * Math.min(first.height, it.height)) {
      group.push(it)
    } else groups.push([it])
  }
  return groups.map((group) => ({
    y: group[0]?.y ?? 0,
    height: median(group.map((it) => it.height)),
    runs: group
      .map((it) => ({
        text: it.text,
        x: it.x,
        end: it.x + it.width,
        height: it.height,
        font: it.font,
      }))
      .sort((a, b) => a.x - b.x),
  }))
}

/** Starts like a code: ICD-10 (`F25`, `Z99.12`), HCPCS (`J7500`) or CPT/revenue digits. */
const CODE_LIKE = /^([A-Z]\d[0-9A-Z]|\d{3})/

const hasCodeLike = (line: Line) => line.runs.some((r) => CODE_LIKE.test(r.text))

/** Two or more cells, one of them naming a code column. */
const isHeaderLine = (line: Line) => {
  const cells = headerCells(line.runs)
  return cells.length >= 2 && guessColumnRoles(cells.map((c) => c.text)).includes('code')
}

const isPageNumber = (line: Line) =>
  line.runs.length === 1 && PAGE_NUMBER.test(line.runs[0]?.text ?? '')

interface PageHeader {
  /** Header cells, left to right, with the x-range of their text. */
  cells: { text: string; x: number; end: number }[]
  /** Index of the header line (lines above it are a title). */
  index: number
  /** Index of the first line below the header. */
  bodyStart: number
}

/**
 * The header line: above the first line with a code (GA data lines say "ICD-10-CM"), plus
 * up to two lines just below it in the header's font and without codes (LA's "Designation").
 */
function findHeader(lines: Line[]): PageHeader | null {
  const firstCode = lines.findIndex(hasCodeLike)
  const window = lines.slice(0, Math.min(HEADER_SEARCH_LINES, firstCode < 0 ? Infinity : firstCode))
  const index = window.findIndex(isHeaderLine)
  const line = lines[index]
  if (index < 0 || !line) return null
  const cells = headerCells(line.runs)
  const fonts = new Set(line.runs.map((r) => r.font))
  let bodyStart = index + 1
  let previousY = line.y
  for (let i = index + 1; i <= index + MAX_HEADER_CONTINUATION; i++) {
    const next = lines[i]
    if (!next) break
    const tight = next.y - previousY <= 2 * line.height
    if (!tight || hasCodeLike(next) || !next.runs.every((r) => fonts.has(r.font))) break
    for (const s of next.runs) {
      const centre = (s.x + s.end) / 2
      const cell = nearest(cells, centre, (c) => (c.x + c.end) / 2)
      if (cell) cell.text += ` ${s.text}`
    }
    previousY = next.y
    bodyStart = i + 1
  }
  return { cells, index, bodyStart }
}

function nearest<T>(values: T[], target: number, position: (v: T) => number): T | undefined {
  let best: T | undefined
  let bestDistance = Infinity
  for (const v of values) {
    const d = Math.abs(position(v) - target)
    if (d < bestDistance) {
      best = v
      bestDistance = d
    }
  }
  return best
}

/**
 * Where each column's text starts on this page. Cells are left-aligned, so the starts of the
 * runs cluster at the column edges; the `count` clusters seen on the most lines win.
 * Headers can be centered (LA), so they only break ties when the page has too few clusters.
 */
function columnStarts(body: Line[], count: number, reference: number[]): number[] {
  const xs = body.flatMap((line) => line.runs.map((r) => r.x)).sort((a, b) => a - b)
  const clusters: { x: number; lines: number }[] = []
  for (const x of xs) {
    const last = clusters.at(-1)
    if (last && x - last.x <= 3) last.lines++
    else clusters.push({ x, lines: 1 })
  }
  const chosen = [...clusters]
    .sort((a, b) => b.lines - a.lines || a.x - b.x)
    .slice(0, count)
    .map((c) => c.x)
    .sort((a, b) => a - b)
  if (chosen.length === count || reference.length !== count) return chosen
  // Too few clusters (a column empty on this page): place each at the nearest reference.
  const starts: number[] = [...reference]
  const free = new Set(reference.keys())
  for (const x of chosen) {
    const index = nearest([...free], x, (i) => reference[i] ?? 0)
    if (index === undefined) continue
    starts[index] = x
    free.delete(index)
  }
  // Columns with no text on this page keep a start no text can reach.
  for (const i of free) starts[i] = Infinity
  return starts
}

/**
 * Splits a run that holds two cells. LA's printer joined a cell to the next one when they were
 * close: a description and its code ("… AGONIST/5HT M H7X"), or a designation and its
 * description ("0 Bronchiectasis"). The split is at the space nearest the column edge, placing
 * characters by the run's average width, and only if the next column is empty on this line
 * and the split leaves a code on the right or one word on the left. LA descriptions also
 * overflow under the code column (clipped on paper); those stay whole.
 */
function splitRun(run: Run, starts: number[], taken: Set<number>): Run[] {
  const column = starts.findIndex((s) => s > run.x + 0.5 * run.height && s < run.end)
  const edge = starts[column]
  if (edge === undefined || taken.has(column)) return [run]
  const perChar = (run.end - run.x) / run.text.length
  let space = -1
  let bestDistance = 1.5 * perChar
  for (let i = 0; i < run.text.length; i++) {
    if (run.text[i] !== ' ') continue
    const distance = Math.abs(run.x + (i + 1) * perChar - edge)
    if (distance <= bestDistance) {
      space = i
      bestDistance = distance
    }
  }
  // A code near the edge is split off even if the estimate lands a word early.
  const last = run.text.lastIndexOf(' ')
  const lastWordX = run.x + (last + 1) * perChar
  if (last > 0 && CODE_LIKE.test(run.text.slice(last + 1))) {
    if (Math.abs(lastWordX - edge) <= Math.max(3 * perChar, run.height)) space = last
  }
  if (space < 0) return [run]
  const left = run.text.slice(0, space).trimEnd()
  const right = run.text.slice(space + 1).trimStart()
  const splits = right !== '' && (!left.includes(' ') || (space === last && CODE_LIKE.test(right)))
  if (left === '' || !splits) return [run]
  const at = run.x + (space + 1) * perChar
  return [
    { ...run, text: left, end: at - perChar },
    { ...run, text: right, x: Math.max(at, edge) },
  ]
}

/** The column a run starts in: the last one that starts at or before it. */
function columnOf(x: number, height: number, starts: number[]): number {
  let column = 0
  starts.forEach((start, i) => {
    if (start <= x + 0.5 * height) column = i
  })
  return column
}

/** The cells of a line: each run goes to the last column that starts at or before it. */
function toCells(line: Line, starts: number[]): string[] {
  const cells = starts.map(() => '')
  const ends = starts.map(() => -Infinity)
  const taken = new Set(line.runs.map((r) => columnOf(r.x, r.height, starts)))
  for (const run of line.runs.flatMap((r) => splitRun(r, starts, taken))) {
    const column = columnOf(run.x, run.height, starts)
    const text = cells[column] ?? ''
    cells[column] = text === '' ? run.text : joinRuns(text, ends[column] ?? -Infinity, run)
    ends[column] = run.end
  }
  return cells
}

interface BodyLine {
  page: number
  /** 1-based line number among the table lines on its page. */
  number: number
  y: number
  height: number
  cells: string[]
  first: boolean
  last: boolean
}

interface TableDraft {
  header: string[]
  key: string
  firstPage: number
  lastPage: number
  lines: BodyLine[]
}

/** Joins wrapped text: no space after a hyphen that ends a word ("substance-" "induced"). */
function joinText(a: string, b: string): string {
  if (a === '') return b
  if (b === '') return a
  return /\S[-–]$/.test(a) ? a + b : `${a} ${b}`
}

const startsLower = (text: string) => /^\p{Ll}/u.test(text)

/** Votes for a wrap direction from the lines that have text but no code. */
function detectWrap(drafts: TableDraft[]): WrapDirection {
  let above = 0
  let below = 0
  for (const draft of drafts) {
    const code = guessColumnRoles(draft.header).indexOf('code')
    if (code < 0) continue
    const hasCode = (l: BodyLine | undefined) => (l?.cells[code] ?? '') !== ''
    draft.lines.forEach((line, i) => {
      if (hasCode(line)) return
      // Excel does not split a row across pages.
      if (line.first) above++
      if (line.last) below++
      const prev = draft.lines[i - 1]
      const next = draft.lines[i + 1]
      line.cells.forEach((text, c) => {
        if (c === code || text === '') return
        if (startsLower(text)) below++
        if (next && hasCode(next) && startsLower(next.cells[c] ?? '')) above++
      })
      // The line sits closer to the row it belongs to.
      if (prev?.page === line.page && next?.page === line.page) {
        const up = line.y - prev.y
        const down = next.y - line.y
        const margin = 0.25 * line.height
        if (hasCode(prev) && up < down - margin) below++
        if (hasCode(next) && down < up - margin) above++
      }
    })
  }
  return below > above ? 'below' : 'above'
}

/** Lines with no code longer than this between two codes are not weighed, just split by
 * direction (keeps the search linear on odd files). */
const MAX_WEIGHED_GAP = 12
/** Cost of putting one line on the side the direction does not favor: breaks ties only,
 * unless the admin chose the direction. */
const DIRECTION_TIE = 0.01
const DIRECTION_FORCED = 1000

/**
 * How unlike a real row these lines are, column by column: a value written twice ("Tier 1 …
 * Tier 1 …"), a column most rows have left empty, or a cell that starts mid-sentence.
 */
function rowCost(lines: BodyLine[], code: number, expected: boolean[]): number {
  let cost = 0
  expected.forEach((isExpected, c) => {
    if (c === code) return
    const parts = lines.map((l) => l.cells[c] ?? '').filter((t) => t !== '')
    const first = parts[0]
    if (first === undefined) {
      if (isExpected) cost += 1
      return
    }
    if (startsLower(first)) cost += 1
    if (new Set(parts).size < parts.length) cost += 3
  })
  return cost
}

/** Extra cost of leaving lines as a row with no code: chosen only when joining them to a
 * neighbour would write a value twice (GA-B page 60 "Nonsuicidal self-harm" has no code). */
const ORPHAN_COST = 1.5

type Anchor = [BodyLine, ...BodyLine[]]
/** How a gap splits: lines [0, up) join the row above, [up, down) stand alone, the rest join
 * the row below. */
interface GapSplit {
  up: number
  down: number
}
interface Step {
  cost: number
  split: GapSplit
  from: number
}

/**
 * Groups lines into rows, one per code. The lines with no code between two codes go to the
 * row above, the row below, or (rarely) a row of their own: per gap, the split that makes the
 * rows most row-like wins, because a file can mix top- and bottom-aligned cells (MT does).
 * A row's cost depends on the gaps above and below it, so the splits are chosen for the whole
 * table at once (dynamic programming over the gaps).
 */
function toRows(draft: TableDraft, wrap: WrapDirection, forced: boolean): RawTable['rows'] {
  const code = guessColumnRoles(draft.header).indexOf('code')
  const width = draft.header.length
  const merge = (lines: BodyLine[]) =>
    Array.from({ length: width }, (_, c) =>
      lines.reduce((text, line) => joinText(text, line.cells[c] ?? ''), ''),
    )
  const row = (lines: BodyLine[], at: BodyLine) => ({
    cells: merge(lines),
    locator: `page ${String(at.page)}, line ${String(at.number)}`,
  })
  if (code < 0) return draft.lines.map((line) => row([line], line))

  // Anchors: lines with a code. A code that ends in a comma, hyphen or "and" on a line of its
  // own goes on below ("33927, 33928, 33929,"); NE's "E09.349," has a description on its line:
  // a stray comma, not a list.
  const anchors: Anchor[] = []
  const gaps: BodyLine[][] = [[]]
  for (const line of draft.lines) {
    const gap = gaps[gaps.length - 1] ?? []
    if ((line.cells[code] ?? '') === '') {
      gap.push(line)
      continue
    }
    const previous = anchors.at(-1)
    const last = previous?.at(-1)
    const onlyCode = last?.cells.every((text, c) => c === code || text === '') ?? false
    if (previous && gap.length === 0 && onlyCode && CODE_JOINER.test(merge(previous)[code] ?? '')) {
      previous.push(line)
      continue
    }
    anchors.push([line])
    gaps.push([])
  }

  if (anchors.length === 0) return draft.lines.map((line) => row([line], line))

  // Columns that nearly every row fills (tier, category, "Yes/ No"): a row without one is
  // probably missing a line.
  const expected = Array.from({ length: width }, (_, c) => {
    const filled = draft.lines.filter((l) => (l.cells[c] ?? '') !== '').length
    return filled >= 0.9 * anchors.length
  })

  const m = anchors.length
  const gap = (i: number) => gaps[i] ?? []
  const splits = (i: number): GapSplit[] => {
    const n = gap(i).length
    if (n > MAX_WEIGHED_GAP && i > 0 && i < m) {
      return [wrap === 'below' ? { up: n, down: n } : { up: 0, down: 0 }]
    }
    const options: GapSplit[] = []
    for (let up = 0; up <= n; up++) {
      for (let down = up; down <= n; down++) {
        // Nothing above the first anchor or below the last one.
        if ((i === 0 && up > 0) || (i === m && down < n)) continue
        options.push({ up, down })
      }
    }
    return options
  }
  const tie = forced ? DIRECTION_FORCED : DIRECTION_TIE
  const gapCost = (i: number, { up, down }: GapSplit) => {
    const lines = gap(i)
    const alone = lines.slice(up, down)
    const against = wrap === 'below' ? lines.length - down : up
    return (
      tie * (against + alone.length) +
      (alone.length > 0 ? ORPHAN_COST + rowCost(alone, code, expected) : 0)
    )
  }
  const rowLines = (j: number, above: GapSplit, below: GapSplit) => [
    ...gap(j).slice(above.down),
    ...(anchors[j] ?? []),
    ...gap(j + 1).slice(0, below.up),
  ]

  // steps[i][s]: the cheapest way to reach split s of gap i, and the split of gap i-1 it came
  // from.
  const options = Array.from({ length: m + 1 }, (_, i) => splits(i))
  const steps: Step[][] = [
    options[0]?.map((split) => ({ cost: gapCost(0, split), split, from: -1 })) ?? [],
  ]
  for (let j = 0; j < m; j++) {
    const previous = steps[j] ?? []
    steps.push(
      (options[j + 1] ?? []).map((split) => {
        let bestStep: Step = { cost: Infinity, split, from: 0 }
        previous.forEach((step, from) => {
          const cost =
            step.cost +
            rowCost(rowLines(j, step.split, split), code, expected) +
            gapCost(j + 1, split)
          if (cost < bestStep.cost) bestStep = { cost, split, from }
        })
        return bestStep
      }),
    )
  }

  // Walk back from the cheapest end, then build the rows in page order.
  const chosen: GapSplit[] = []
  const last = steps[m] ?? []
  let index = last.reduce((b, s, i) => (s.cost < (last[b]?.cost ?? Infinity) ? i : b), 0)
  for (let i = m; i >= 0; i--) {
    const step = steps[i]?.[index]
    chosen[i] = step?.split ?? { up: 0, down: 0 }
    index = step?.from ?? 0
  }
  const rows: RawTable['rows'] = []
  const pushAlone = (i: number) => {
    const split = chosen[i] ?? { up: 0, down: 0 }
    const alone = gap(i).slice(split.up, split.down)
    if (alone[0]) rows.push(row(alone, alone[0]))
  }
  anchors.forEach((anchor, j) => {
    pushAlone(j)
    const none = { up: 0, down: 0 }
    rows.push(row(rowLines(j, chosen[j] ?? none, chosen[j + 1] ?? none), anchor[0]))
  })
  pushAlone(m)
  if (rows.length > MAX_ROWS)
    throw new ParseError(`The PDF has more than ${String(MAX_ROWS)} rows.`)
  return rows
}

export function rebuildPdfTables(pages: PdfPageText[], options: PdfLayoutOptions): PdfLayoutResult {
  if (pages.every((p) => p.items.every((it) => it.text.trim() === ''))) {
    throw new ParseError(`${options.name} has no text to read. It may be a scanned image.`)
  }
  const drafts: TableDraft[] = []
  // Typed up front: assigned in the loop, so TypeScript must not narrow it to null.
  let current = null as TableDraft | null
  let reference: number[] = []
  let titleText = ''
  const addTitle = (lines: Line[]) => {
    for (const line of lines) {
      if (titleText.length >= MAX_TITLE_TEXT) return
      titleText = `${titleText} ${line.runs.map((r) => r.text).join(' ')}`.trim()
    }
  }

  for (const page of pages) {
    const lines = toLines(page.items)
    const header = findHeader(lines)
    if (drafts.length === 0) addTitle(header ? lines.slice(0, header.index) : lines)
    if (header) {
      if (header.cells.length > MAX_COLUMNS) {
        throw new ParseError(
          `Page ${String(page.page)} has more than ${String(MAX_COLUMNS)} columns.`,
        )
      }
      const texts = header.cells.map((c) => c.text)
      const key = headerKey(texts)
      if (current?.key !== key) {
        current = { header: texts, key, firstPage: page.page, lastPage: page.page, lines: [] }
        drafts.push(current)
        // Centered headers (LA) start right of their data; use the left edge as a fallback.
        reference = header.cells.map((c) => c.x)
      }
    }
    if (!current) continue // A title or contents page before the first table.
    const body = lines.slice(header?.bodyStart ?? 0).filter((l) => !isPageNumber(l))
    if (body.length === 0) continue
    const starts = columnStarts(body, current.header.length, reference)
    if (starts.every(Number.isFinite)) reference = starts
    current.lastPage = page.page
    body.forEach((line, i) => {
      current?.lines.push({
        page: page.page,
        number: i + 1,
        y: line.y,
        height: line.height,
        cells: toCells(line, starts),
        first: i === 0,
        last: i === body.length - 1,
      })
    })
  }

  if (drafts.length === 0) {
    throw new ParseError(
      `${options.name} has no table header with a code column (such as “Code” or “Diagnosis code”).`,
    )
  }
  const wrap = options.wrap === 'auto' ? detectWrap(drafts) : options.wrap
  return {
    wrap,
    titleText: titleText.slice(0, MAX_TITLE_TEXT),
    tables: drafts.map((d) => ({
      name:
        d.firstPage === d.lastPage
          ? `Page ${String(d.firstPage)}`
          : `Pages ${String(d.firstPage)}–${String(d.lastPage)}`,
      header: d.header,
      rows: toRows(d, wrap, options.wrap !== 'auto'),
    })),
  }
}
