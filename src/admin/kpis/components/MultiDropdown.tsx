import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  label: string
  options: { value: string; count: number }[]
  selected: Set<string>
  onToggle: (v: string) => void
  onToggleAll: (all: boolean) => void
}

export default function MultiDropdown({ label, options, selected, onToggle, onToggleAll }: Props) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null)

  function openMenu() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, minWidth: r.width })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    function onReposition() {
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect()
        setPos({ top: r.bottom + 4, left: r.left, minWidth: r.width })
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open])

  const allSelected = selected.size >= options.length
  const partial = selected.size > 0 && !allSelected

  return (
    <div className="kpi-dropdown">
      <button
        ref={btnRef}
        className={`kpi-dropdown-btn${partial ? ' partial' : ''}`}
        onClick={() => open ? setOpen(false) : openMenu()}
      >
        {label}
        {partial && <span className="kpi-dropdown-badge">{selected.size}</span>}
        <span className="kpi-dropdown-arrow">▾</span>
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="kpi-dropdown-menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: Math.max(pos.minWidth, 210) }}
        >
          <label className="kpi-dropdown-all">
            <input type="checkbox" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} />
            Alle
          </label>
          {options.map((o) => (
            <label key={o.value} className="kpi-dropdown-option">
              <input type="checkbox" checked={selected.has(o.value)} onChange={() => onToggle(o.value)} />
              <span className="kpi-dropdown-label">{o.value || '(leer)'}</span>
              <span className="kpi-dropdown-count">{o.count}</span>
            </label>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
