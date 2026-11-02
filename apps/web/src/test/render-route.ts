import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { render } from '@testing-library/vue'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type Router, RouterView } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import App from '../App.vue'

/** Renders the real file-based route at `path`, with a fresh query cache and no retries. */
export async function renderRoute(path: string): Promise<{ router: Router }> {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    defineComponent(() => () => h(RouterView)),
    { global: { plugins: [router, [VueQueryPlugin, { queryClient }]] } },
  )
  return { router }
}

/** Renders the whole app shell (header, nav, footer) at `path`. */
export async function renderApp(path: string): Promise<{ router: Router }> {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(App, { global: { plugins: [router, [VueQueryPlugin, { queryClient }]] } })
  return { router }
}
