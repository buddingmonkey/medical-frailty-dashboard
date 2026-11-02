import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

/** Console errors and uncaught exceptions, including CSP violations ("Refused to ..."). */
export function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/** Serious and critical WCAG 2.1 A/AA violations (docs/testing.md). */
export async function seriousA11yViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${String(v.nodes.length)})`)
}
