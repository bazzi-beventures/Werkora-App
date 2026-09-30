import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import GeruestfaecherInput from './GeruestfaecherInput'

afterEach(cleanup)

function setup(value: string[] = []) {
  const onChange = vi.fn()
  render(<GeruestfaecherInput value={value} onChange={onChange} />)
  return { onChange, input: screen.getByRole('textbox') }
}

describe('GeruestfaecherInput', () => {
  it('übernimmt «2c» mit Enter als «2C»', () => {
    const { onChange, input } = setup(['14'])
    fireEvent.change(input, { target: { value: '2c' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['14', '2C'])
  })

  it('übernimmt beim Verlassen des Felds — nichts geht beim Speichern verloren', () => {
    const { onChange, input } = setup()
    fireEvent.change(input, { target: { value: '2C, 3a' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(['2C', '3A'])
  })

  it('zeigt ungültige Eingaben an und lässt sie im Feld stehen', () => {
    const { onChange, input } = setup()
    fireEvent.change(input, { target: { value: '2-C' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('2-C')
    expect((input as HTMLInputElement).value).toBe('2-C')
  })

  it('entfernt ein Fach über das ×', () => {
    const { onChange } = setup(['2C', '14'])
    fireEvent.click(screen.getByRole('button', { name: 'Gerüstfach 2C entfernen' }))
    expect(onChange).toHaveBeenCalledWith(['14'])
  })
})
