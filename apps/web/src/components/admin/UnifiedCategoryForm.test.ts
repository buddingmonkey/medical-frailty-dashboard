import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import '../../test/ui-sdk-stubs'

import UnifiedCategoryForm from './UnifiedCategoryForm.vue'

const fields = [
  'Label',
  'Slug',
  'Definition',
  'Includes',
  'Excludes',
  'Federal parent',
  'Status',
  'Sort order',
  'CCSR groups',
]

function setup() {
  render(UnifiedCategoryForm, { props: { ccsrOptions: [] } })
}

describe('UnifiedCategoryForm field help', () => {
  it('gives every field an info button with its own help', () => {
    setup()

    const descriptions = fields.map((field) => {
      const button = screen.getByRole('button', { name: `About ${field}` })
      const description = button.getAttribute('aria-describedby')
      expect(description).toBeTruthy()
      return document.getElementById(description ?? '')?.textContent ?? ''
    })
    for (const d of descriptions) expect(d.length).toBeGreaterThan(20)
    expect(new Set(descriptions).size).toBe(fields.length)
  })

  it('explains that sort order orders the public comparison categories', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: 'About Sort order' }))

    expect(screen.getByRole('tooltip').textContent).toMatch(/lower numbers come first/i)
  })

  it('keeps the fields named by their labels and the slug described by its help', () => {
    setup()

    expect(screen.getByRole('textbox', { name: 'Sort order' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'CCSR groups' })).toBeTruthy()
    expect(
      screen.getByRole('textbox', {
        name: /^Slug/,
        description: 'Lowercase letters, digits and hyphens. Must be unique.',
      }),
    ).toBeTruthy()
  })
})
