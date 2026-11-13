import { qualificationHelp } from '@mfcd/shared'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import '../../test/ui-sdk-stubs'

import QualificationBadge from './QualificationBadge.vue'

function setup() {
  const user = userEvent.setup()
  render(QualificationBadge, {
    props: { match: { qualification: 'standalone', qualificationBasis: 'inferred' } },
  })
  return { user, badge: screen.getByRole('button', { name: 'Enough by itself (inferred)' }) }
}

describe('QualificationBadge', () => {
  it('is a button described by the rule’s help text, with no title attribute', () => {
    const { badge } = setup()

    expect(
      screen.getByRole('button', {
        name: 'Enough by itself (inferred)',
        description: qualificationHelp.standalone,
      }),
    ).toBe(badge)
    expect(badge.hasAttribute('title')).toBe(false)
  })

  it('shows the help on keyboard focus and hides it on Escape', async () => {
    const { user, badge } = setup()

    await user.tab()
    expect(document.activeElement).toBe(badge)
    expect(screen.getByRole('tooltip').textContent).toBe(qualificationHelp.standalone)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(document.activeElement).toBe(badge)
  })

  it('opens and closes the help on a tap, for touch screens', async () => {
    const { user, badge } = setup()

    await user.click(badge)
    expect(screen.getByRole('tooltip').textContent).toBe(qualificationHelp.standalone)

    await user.click(badge)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
