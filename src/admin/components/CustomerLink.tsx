import type { CSSProperties, MouseEvent, ReactNode } from 'react'

// Sprung aus einem Projekt auf die Kundenstammseite (Feature-Anfrage WW-9,
// Gegenstück zu WF-3: docs/specs/kunden-projekte-verlinkung.md §5).
//
// Ein echter Link auf `#/admin/customers/<id>`, wie die Projektzeilen auf der
// Kundenseite: ein normaler Klick springt in der App (über `onOpen`, damit die
// «ungespeicherte Änderungen»-Abfrage greift), Ctrl-/Cmd-/Mittel-Klick öffnet
// den Kunden in einem neuen Tab — der Kaltstart liest denselben Hash
// (shared/deepLink.ts) und das Projekt bleibt im alten Tab offen.
//
// Ohne `onOpen` bleibt es reiner Text: ein Hash-Link im laufenden Betrieb täte
// nichts, der Sprung wird nur beim App-Start eingelöst.

/** Linksklick ohne Modifier — alles andere gehört dem Browser (neuer Tab, Fenster). */
export function isPlainClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

export function customerHref(customerId: string): string {
  return `#/admin/customers/${encodeURIComponent(customerId)}`
}

export function CustomerLink({
  customerId, onOpen, children, title = 'Im Kundenstamm öffnen', style,
}: {
  customerId: string
  onOpen?: (customerId: string) => void
  children: ReactNode
  title?: string
  style?: CSSProperties
}) {
  if (!onOpen) return <span style={style}>{children}</span>
  return (
    <a
      href={customerHref(customerId)}
      title={title}
      onClick={e => {
        if (!isPlainClick(e)) return
        e.preventDefault()
        onOpen(customerId)
      }}
      style={{ color: 'var(--primary)', textDecoration: 'underline', textUnderlineOffset: 2, ...style }}
    >
      {children}
    </a>
  )
}
