import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'admin-theme'

export function loadTheme(): Theme {
  // Default: Light. Nur wer explizit Dark gewählt hat, behält Dark.
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return v === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem(THEME_STORAGE_KEY, t) } catch { /* ignore */ }
}

export function toggleTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark'
}

// React-Hook, der das aktuelle Theme zurückgibt und bei jedem Wechsel neu
// rendert — egal welcher Screen den Toggle ausgelöst hat. Beobachtet dazu das
// data-theme-Attribut auf <html>, das applyTheme() setzt. So braucht der
// Theme-State nicht durch jede Komponente gefädelt zu werden.
function subscribeTheme(callback: () => void): () => void {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  return () => observer.disconnect()
}

function getThemeSnapshot(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => 'light')
}
