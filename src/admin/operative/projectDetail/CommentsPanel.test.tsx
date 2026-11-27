import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectComment } from '../../../api/admin/projects'
import { CommentsPanel } from './CommentsPanel'
import { neuesteZuerst, type UseProjectComments } from './useProjectComments'

// WW-115: im Admin stehen die neuesten Kommentare oben, das Eingabefeld darüber.

function kommentar(id: string, created_at: string, text: string): ProjectComment {
  return { id, author_name: 'Test', text, created_at } as ProjectComment
}

const LISTE = [
  kommentar('a', '2026-09-24T15:06:00+00:00', 'alt'),
  kommentar('b', '2026-11-23T10:06:00+00:00', 'neu'),
  kommentar('c', '2026-11-08T13:21:00+00:00', 'mitte'),
]

function hook(comments: ProjectComment[]): UseProjectComments {
  return {
    comments, newComment: '', setNewComment: vi.fn(), adding: false,
    editingId: null, editingText: '', setEditingText: vi.fn(), savingEdit: false,
    confirmDeleteId: null, setConfirmDeleteId: vi.fn(), deleting: false,
    reload: vi.fn(), add: vi.fn(), startEdit: vi.fn(), cancelEdit: vi.fn(),
    saveEdit: vi.fn(), remove: vi.fn(), isLocked: () => true,
  }
}

describe('neuesteZuerst', () => {
  it('sortiert absteigend nach created_at und lässt die Eingabe unverändert', () => {
    expect(neuesteZuerst(LISTE).map(c => c.id)).toEqual(['b', 'c', 'a'])
    expect(LISTE.map(c => c.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('CommentsPanel', () => {
  it('zeigt den neuesten Kommentar zuoberst und die Eingabe über der Liste', () => {
    render(<CommentsPanel c={hook(LISTE)} now={Date.parse('2026-11-27T12:00:00Z')} />)
    const texte = ['neu', 'mitte', 'alt'].map(t => screen.getByText(t))
    for (let i = 1; i < texte.length; i++) {
      expect(texte[i - 1].compareDocumentPosition(texte[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    const eingabe = screen.getByPlaceholderText('Kommentar hinzufügen…')
    expect(eingabe.compareDocumentPosition(texte[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
