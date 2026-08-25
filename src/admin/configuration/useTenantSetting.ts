import { useCallback, useEffect, useState } from 'react'

type ToastFn = (msg: string, type: 'success' | 'error') => void

// Gemeinsames Lade-/Speicher-Skelett der Konfigurations-Tabs: ein Einstellungs-
// Wert wird als Ganzes geladen, lokal bearbeitet und als Ganzes gespeichert;
// «dirty» ergibt sich aus dem Vergleich mit dem zuletzt geladenen bzw.
// gespeicherten Stand (statt einem von Hand gepflegten Flag).
export function useTenantSetting<T>(opts: {
  load: () => Promise<T>
  // Liefert den vom Server bestätigten Stand zurück — der wird zur neuen
  // Vergleichsbasis (Server kann Werte normalisieren, z.B. Defaults auffüllen).
  save: (value: T) => Promise<T>
  onToast: ToastFn
  savedMsg: string
  // Vergleichsbasis für dirty; Standard JSON.stringify. Für Werte, die JSON
  // nicht stabil abbildet (Map/Set, irrelevante Reihenfolge), eigene
  // Serialisierung mitgeben.
  serialize?: (value: T) => string
  // Reload-Auslöser (z.B. das gewählte Jahr im Wochenplan): ändert er sich,
  // lädt der Hook neu.
  //
  // Ein einzelner Wert, KEIN deps-Array. Ein durchgereichtes Array kann der
  // React Compiler nicht prüfen (`react-hooks/use-memo` will ein Literal), und
  // gebraucht wurde ohnehin nie mehr als ein Auslöser. Wer mehrere braucht,
  // gibt einen zusammengesetzten Schlüssel (z.B. `${jahr}-${mandant}`).
  reloadKey?: unknown
}) {
  const { load, save, onToast, savedMsg } = opts
  const serialize = opts.serialize ?? ((v: T) => JSON.stringify(v))
  const [value, setValue] = useState<T | null>(null)
  const [original, setOriginal] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const v = await load()
      setValue(v)
      setOriginal(serialize(v))
    } catch {
      onToast('Laden fehlgeschlagen', 'error')
    } finally {
      setLoading(false)
    }
    // load/serialize/onToast kommen bei jedem Render neu und wuerden den Hook
    // in eine Endlosschleife treiben; der Reload haengt bewusst allein am
    // reloadKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.reloadKey])

  useEffect(() => { void reload() }, [reload])

  const dirty = value !== null && serialize(value) !== original

  async function persist() {
    if (value === null) return
    setSaving(true)
    try {
      const saved = await save(value)
      setValue(saved)
      setOriginal(serialize(saved))
      onToast(savedMsg, 'success')
    } catch {
      onToast('Speichern fehlgeschlagen', 'error')
    } finally {
      setSaving(false)
    }
  }

  return { value, setValue, loading, saving, dirty, reload, persist }
}
