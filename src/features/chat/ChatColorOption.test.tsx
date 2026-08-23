import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatColorOption } from './ChatColorOption'

afterEach(cleanup)

describe('ChatColorOption', () => {
  it('exposes its selected state without relying on color', () => {
    const onSelect = vi.fn()
    render(
      <ChatColorOption
        value="#16a34a"
        label="grøn"
        selected
        onSelect={onSelect}
      />,
    )

    const option = screen.getByRole('button', { name: 'Vælg grøn' })
    expect(option.getAttribute('aria-pressed')).toBe('true')
    expect(option.textContent).toBe('✓')

    fireEvent.click(option)
    expect(onSelect).toHaveBeenCalledWith('#16a34a')
  })
})
