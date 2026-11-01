import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import ThemeMenu from './ThemeMenu.vue'

const root = document.documentElement

function setup() {
  const user = userEvent.setup()
  render(ThemeMenu)
  const button = screen.getByRole('button', { name: /theme/i })
  return { user, button }
}

describe('ThemeMenu', () => {
  it('follows the system setting by default', () => {
    const { button } = setup()

    expect(button.getAttribute('aria-label')).toBe('Theme: System')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it('lists System, Light and Dark with the current choice checked', async () => {
    const { user, button } = setup()

    await user.click(button)

    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((item) => item.textContent.trim())).toEqual(['System', 'Light', 'Dark'])
    expect(screen.getByRole('menuitemradio', { name: 'System' }).getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('applies and remembers Dark, then closes and returns focus', async () => {
    const { user, button } = setup()

    await user.click(button)
    await user.click(screen.getByRole('menuitemradio', { name: 'Dark' }))

    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('mfcd-theme')).toBe('dark')
    expect(button.getAttribute('aria-label')).toBe('Theme: Dark')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('restores a saved choice, and System clears it', async () => {
    localStorage.setItem('mfcd-theme', 'light')
    const { user, button } = setup()

    expect(button.getAttribute('aria-label')).toBe('Theme: Light')
    expect(root.getAttribute('data-theme')).toBe('light')

    await user.click(button)
    await user.click(screen.getByRole('menuitemradio', { name: 'System' }))

    expect(root.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem('mfcd-theme')).toBeNull()
  })

  it('works from the keyboard', async () => {
    const { user, button } = setup()

    button.focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'System' }))

    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Light' }))

    await user.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Dark' }))

    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'System' }))

    await user.keyboard('{ArrowUp}{Enter}')
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(document.activeElement).toBe(button)
  })

  it('closes on Escape and on a click outside without changing the theme', async () => {
    const { user, button } = setup()

    await user.click(button)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)

    await user.click(button)
    await user.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(root.hasAttribute('data-theme')).toBe(false)
  })
})
