/// <reference lib="webworker" />
// Runs the parser adapters off the main thread (docs/security.md, "Upload safety").
import { type ParseInput, parseSource } from './parse'

export type WorkerReply =
  { ok: true; tables: Awaited<ReturnType<typeof parseSource>> } | { ok: false; message: string }

self.onmessage = (event: MessageEvent<ParseInput>) => {
  parseSource(event.data).then(
    (tables) => {
      self.postMessage({ ok: true, tables } satisfies WorkerReply)
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
