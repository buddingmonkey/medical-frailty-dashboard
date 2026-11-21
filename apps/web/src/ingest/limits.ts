// Shared by the PDF and spreadsheet adapters. Its own module, so parse.ts (in the ingest
// page's chunk) does not pull in pdf-layout.ts.

/** Enough title text to name a state; a contents page can be long. */
export const MAX_TITLE_TEXT = 2_000
