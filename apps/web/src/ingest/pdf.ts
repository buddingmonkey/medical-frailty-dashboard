import {
  getDocument,
  PasswordException,
  type PDFDocumentLoadingTask,
  PDFWorker,
  VerbosityLevel,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

import { ParseError } from './parse-error'
import {
  type PdfLayoutResult,
  type PdfPageText,
  type PdfTextItem,
  rebuildPdfTables,
  type WrapDirection,
} from './pdf-layout'

// PDF adapter (docs/ingestion.md, "Parser adapters"). The legacy build carries the polyfills
// that older browsers and Node (tests) lack. pdf.js 6 has no eval path to turn off; fonts are
// never loaded into the page and nothing is fetched.

export const MAX_PDF_PAGES = 2000

/**
 * In the browser, pdf.js parses in a worker of its own, which we start from our parser worker
 * and hand to pdf.js as a port. pdf.js cannot start it here itself (it reads
 * `window.location`), and its worker module must not run inside ours: it takes over the
 * worker's messages. Under Node (tests) pdf.js runs in-process by itself.
 */
function startPdfWorker(): { pdfWorker: PDFWorker; worker: Worker } | null {
  if ('process' in globalThis) return null
  const worker = new Worker(pdfWorkerUrl, { type: 'module' })
  return {
    pdfWorker: PDFWorker.create({ port: worker, verbosity: VerbosityLevel.ERRORS }),
    worker,
  }
}

/** The text runs of every page, with positions from the top-left of the page. */
export async function extractPdfPages(bytes: Uint8Array, name: string): Promise<PdfPageText[]> {
  let task: PDFDocumentLoadingTask | undefined
  const started = startPdfWorker()
  try {
    task = getDocument({
      data: new Uint8Array(bytes),
      worker: started?.pdfWorker,
      verbosity: VerbosityLevel.ERRORS,
      disableFontFace: true,
      useSystemFonts: false,
      enableXfa: false,
      useWorkerFetch: false,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
    })
    const doc = await task.promise
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new ParseError(`${name} has more than ${String(MAX_PDF_PAGES)} pages.`)
    }
    const pages: PdfPageText[] = []
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items: PdfTextItem[] = []
      for (const it of content.items) {
        if (!('str' in it) || it.str.trim() === '') continue
        // Page space to top-down viewport space (handles rotated and offset pages). pdf.js
        // types these arrays loosely; read them as numbers.
        const point: unknown[] = viewport.convertToViewportPoint(
          Number(it.transform[4]),
          Number(it.transform[5]),
        )
        const x = Number(point[0])
        const y = Number(point[1])
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        items.push({ text: it.str, x, y, width: it.width, height: it.height, font: it.fontName })
      }
      pages.push({ page: number, items })
      page.cleanup()
    }
    return pages
  } catch (error) {
    if (error instanceof ParseError) throw error
    if (error instanceof PasswordException) throw new ParseError(`${name} is password-protected.`)
    throw new ParseError(`${name} is not a readable PDF.`)
  } finally {
    await task?.destroy()
    started?.pdfWorker.destroy()
    started?.worker.terminate()
  }
}

export async function parsePdf(
  bytes: Uint8Array,
  name: string,
  wrap: WrapDirection | 'auto',
): Promise<PdfLayoutResult> {
  return rebuildPdfTables(await extractPdfPages(bytes, name), { name, wrap })
}
