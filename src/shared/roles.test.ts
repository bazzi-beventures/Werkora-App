import { describe, it, expect } from 'vitest'
import { hasKpiAccess, isAdminRole, isManagementRole } from './roles'

// Spiegel von agents/routers/_deps.py (ADMIN_ROLES, KPI_ROLES, require_management).

describe('Rollen-Prädikate', () => {
  it.each([
    ['user_light', false, false, false],
    ['user', false, false, false],
    ['admin', true, false, false],
    ['management_light', true, false, true],
    ['management', true, true, true],
    ['superadmin', true, true, true],
    [undefined, false, false, false],
  ])('%s → Admin %s, Management %s, Kennzahlen %s', (role, admin, mgmt, kpi) => {
    expect(isAdminRole(role)).toBe(admin)
    expect(isManagementRole(role)).toBe(mgmt)
    expect(hasKpiAccess(role)).toBe(kpi)
  })
})
