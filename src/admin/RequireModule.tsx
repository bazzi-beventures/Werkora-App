import { ReactNode } from 'react'
import { ModuleName } from '../api/modules'

interface Props {
  module: ModuleName
  enabledModules: string[]
  children: ReactNode
}

function ModuleDisabled({ module }: { module: string }) {
  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Modul nicht aktiv</div>
          <div className="admin-page-subtitle">
            Das Modul <code>{module}</code> ist für diesen Mandanten nicht freigeschaltet.
          </div>
        </div>
      </div>
      <div className="admin-loading" style={{ height: 240, flexDirection: 'column', gap: 12 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3 }}>
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span>Kein Zugriff</span>
      </div>
    </div>
  )
}

export default function RequireModule({ module, enabledModules, children }: Props) {
  if (!enabledModules.includes(module)) {
    return <ModuleDisabled module={module} />
  }
  return <>{children}</>
}
