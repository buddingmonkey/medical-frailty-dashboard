import { type ParseInput, ParseError, type ParseResult, parseSource } from './parse'
import type { WorkerReply } from './worker'

/**
 * Parses in a Web Worker, so a large file never freezes the page. Where there is no Worker
 * (jsdom in component tests) it calls the same adapters directly.
 */
export function runParser(input: ParseInput): Promise<ParseResult> {
  if (typeof Worker === 'undefined') return parseSource(input)
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      worker.terminate()
      if (event.data.ok) resolve(event.data.result)
      else reject(new ParseError(event.data.message))
    }
    worker.onerror = () => {
      worker.terminate()
      reject(new ParseError('Could not read this file.'))
    }
    worker.postMessage(input)
  })
}
