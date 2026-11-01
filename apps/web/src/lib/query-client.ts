import { QueryClient } from '@tanstack/vue-query'

// State code lists change a few times a year, so cached data stays fresh for 5 minutes.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
