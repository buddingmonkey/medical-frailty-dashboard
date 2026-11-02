import { type MaybeRefOrGetter, toValue, watchEffect } from 'vue'

/**
 * Keeps `document.title` in step with the page, using the same titles the Worker puts in the
 * server-rendered HTML (`pageTitles` in packages/shared).
 */
export function usePageTitle(title: MaybeRefOrGetter<string | null>) {
  watchEffect(() => {
    const value = toValue(title)
    if (value !== null) document.title = value
  })
}
