import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import '../../test/ui-sdk-stubs'

import AppTooltip from './AppTooltip.vue'

function setup(props: { text: string; toggleable?: boolean } = { text: 'Help text' }) {
  const user = userEvent.setup()
  const Host = defineComponent(() => () => [
    h('button', { type: 'button' }, 'Before'),
    h(AppTooltip, props, { default: () => 'Badge' }),
  ])
  render(Host)
  return { user, trigger: screen.getByRole('button', { name: 'Badge' }) }
}

const tooltip = () => screen.queryByRole('tooltip')

describe('AppTooltip', () => {
  it('describes its trigger with the text before it opens', () => {
    setup()

    expect(screen.getByRole('button', { name: 'Badge', description: 'Help text' })).toBeTruthy()
    expect(tooltip()).toBeNull()
  })

  it('opens on keyboard focus and closes on Escape, leaving focus on the trigger', async () => {
    const { user, trigger } = setup()

    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(trigger)
    expect(tooltip()?.textContent).toBe('Help text')

    await user.keyboard('{Escape}')
    expect(tooltip()).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes when focus leaves the trigger', async () => {
    const { user } = setup()

    await user.tab()
    await user.tab()
    expect(tooltip()).not.toBeNull()

    await user.tab({ shift: true })
    expect(tooltip()).toBeNull()
  })

  it('opens and closes on a press when toggleable, for touch screens', async () => {
    const { user, trigger } = setup({ text: 'Help text', toggleable: true })

    await user.click(trigger)
    expect(tooltip()?.textContent).toBe('Help text')

    await user.click(trigger)
    expect(tooltip()).toBeNull()
  })
})
