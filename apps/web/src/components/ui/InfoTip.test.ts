import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import '../../test/ui-sdk-stubs'

import InfoTip from './InfoTip.vue'

describe('InfoTip', () => {
  it('is a button named after its field and described by its help', () => {
    render(InfoTip, { props: { label: 'Sort order', text: 'Lower numbers come first.' } })

    const button = screen.getByRole('button', {
      name: 'About Sort order',
      description: 'Lower numbers come first.',
    })
    expect(button.getAttribute('type')).toBe('button')
  })

  it('opens on a tap, for touch screens', async () => {
    const user = userEvent.setup()
    render(InfoTip, { props: { label: 'Slug', text: 'The address.' } })

    await user.click(screen.getByRole('button', { name: 'About Slug' }))

    expect(screen.getByRole('tooltip').textContent).toBe('The address.')
  })
})
