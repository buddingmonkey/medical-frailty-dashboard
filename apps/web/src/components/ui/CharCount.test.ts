import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import CharCount from './CharCount.vue'

describe('CharCount', () => {
  it('shows the length out of the limit, with the id a field points to', () => {
    render(CharCount, { props: { id: 'notes-count', value: 'Twelve chars', max: 4000 } })
    const count = screen.getByText('12 / 4,000 characters')
    expect(count.id).toBe('notes-count')
  })
})
