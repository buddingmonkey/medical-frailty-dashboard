/// <reference lib="webworker" />
// Runs the parser adapters off the main thread (docs/security.md, "Upload safety").
import { type ParseInput, type ParseResult, parseSource } from './parse'

export type WorkerReply = { ok: true; result: ParseResult } | { ok: false; message: string }

self.onmessage = (event: MessageEvent<ParseInput>) => {
  parseSource(event.data).then(
    (result) => {
      self.postMessage({ ok: true, result } satisfies WorkerReply)
    },
    (error: unknown) => {
      const message =
        error instanceof Error && error.name === 'ParseError'
          ? error.message
          : 'Could not read this file.'
      self.postMessage({ ok: false, message } satisfies WorkerReply)
    },
  )
}
