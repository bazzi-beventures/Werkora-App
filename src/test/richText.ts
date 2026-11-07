// Test-Helfer für den RichTextField-Editor (react-simple-wysiwyg, contentEditable).
//
// jsdom kann in einem contentEditable nicht editieren: `fireEvent.change` mit
// `target.value` greift dort nicht, und `user.type` tippt ins Leere. Der Editor hört
// auf `input` und liest dann `innerHTML` — genau das bilden die Helfer nach. Die
// Produktbeschreibung der Offerte ist seit WS-37 ein solcher Editor; die Formular-
// Tests (Entwurf, «geändert»-Erkennung) fassen sie über diese zwei Funktionen an.
import { fireEvent } from '@testing-library/react'

/** Ersetzt den Inhalt des Editors durch `text` (als Klartext) und meldet die Eingabe. */
export function setRichText(el: HTMLElement, text: string): void {
  el.textContent = text
  fireEvent.input(el)
}

/** Sichtbarer Text des Editors, ohne die Zeilenumbrüche, die markdown-it anhängt. */
export function richTextValue(el: HTMLElement): string {
  return (el.textContent ?? '').trim()
}
