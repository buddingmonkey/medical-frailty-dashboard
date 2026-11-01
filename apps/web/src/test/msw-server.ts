import { setupServer } from 'msw/node'

// Shared MSW server for component tests. Add per-test handlers with `server.use(...)`.
// Never mock composables; mock the API instead (docs/testing.md).
export const server = setupServer()
