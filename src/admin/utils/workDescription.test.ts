import { describe, it, expect } from 'vitest'
import { INITIAL_WORK_DESCRIPTION, workDescriptionPayload } from './workDescription'

const geladen = { ...INITIAL_WORK_DESCRIPTION, loading: false }

describe('workDescriptionPayload', () => {
  it('Häkchen aus → leer (kein Block), egal was im Feld steht', () => {
    expect(workDescriptionPayload({ ...geladen, enabled: false, text: 'Montage' })).toBe('')
  })

  it('Häkchen an → genau der Text im Feld', () => {
    expect(workDescriptionPayload({ ...geladen, text: 'Eigener Text' })).toBe('Eigener Text')
  })

  it('Feld geleert bei gesetztem Häkchen → kein Block, wie bisher', () => {
    expect(workDescriptionPayload({ ...geladen, text: '' })).toBe('')
  })

  it('Vorschlag nicht geladen und nichts getippt → undefined, der Server leitet ab', () => {
    expect(workDescriptionPayload({ ...geladen, failed: true, text: '  ' })).toBeUndefined()
  })

  it('Vorschlag nicht geladen, aber eigener Text → der Text gilt', () => {
    expect(workDescriptionPayload({ ...geladen, failed: true, text: 'Reparatur' })).toBe('Reparatur')
  })
})
