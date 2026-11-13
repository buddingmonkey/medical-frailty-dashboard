// Zod 4 tests once per page whether it may build parsers with `new Function`. The site's CSP
// (script-src 'self', no 'unsafe-eval') blocks that, so every page logged a violation report
// before Zod fell back to its normal parser. `jitless` skips the test and always uses that
// parser. Object schemas read the setting when they are built, so index.ts imports this file
// before every module that defines a schema. It is here, not in the web app's main.ts, because
// the bundler puts this package in a chunk that runs before main.ts.
import { z } from 'zod'

z.config({ jitless: true })
