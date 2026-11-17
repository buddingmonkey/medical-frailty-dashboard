import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import '../../test/ui-sdk-stubs'

import UnifiedCategoryForm from './UnifiedCategoryForm.vue'

// Fields with an info button; the others have a visible hint instead (one help per field).
const fields = ['Label', 'Definition', 'Federal parent', 'Sort order', 'CCSR groups']

function setup() {
  render(UnifiedCategoryForm, { props: { ccsrOptions: [] } })
}

describe('UnifiedCategoryForm field help', () => {
  it('gives each field one help: an info button or a visible hint, never both', () => {
    setup()

    const descriptions = fields.map((field) => {
      const button = screen.getByRole('button', { name: `About ${field}` })
      const description = button.getAttribute('aria-describedby')
      expect(description).toBeTruthy()
      return document.getElementById(description ?? '')?.textContent ?? ''
    })
    for (const d of descriptions) expect(d.length).toBeGreaterThan(5)
    expect(new Set(descriptions).size).toBe(fields.length)
    for (const field of ['Slug', 'Includes', 'Excludes', 'Status']) {
      expect(screen.queryByRole('button', { name: `About ${field}` })).toBeNull()
    }
    const hint = 'Text only; CCSR groups decide the codes.'
    expect(screen.getByRole('textbox', { name: /^Includes/, description: hint })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /^Excludes/, description: hint })).toBeTruthy()
    expect(
      screen.getByRole('combobox', { name: 'Status', description: /retire instead/ }),
    ).toBeTruthy()
  })

  it('says why a reserved slug is refused', async () => {
    const user = userEvent.setup()
    setup()

    await user.type(screen.getByRole('textbox', { name: /^Slug/ }), 'codes')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert').textContent).toContain(
      'Slug “codes” is taken by another page.',
    )
  })

  it('explains that sort order orders the public comparison categories', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: 'About Sort order' }))

    expect(screen.getByRole('tooltip').textContent).toMatch(/lower comes first/i)
  })

  it('keeps the fields named by their labels and the slug described by its help', () => {
    setup()

    expect(screen.getByRole('spinbutton', { name: 'Sort order' })).toHaveProperty('max', '100000')
    expect(screen.getByRole('group', { name: 'CCSR groups' })).toBeTruthy()
    expect(
      screen.getByRole('textbox', {
        name: /^Slug/,
        description: 'Lowercase letters, digits and hyphens. Must be unique.',
      }),
    ).toBeTruthy()
  })
})
