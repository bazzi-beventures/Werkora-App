// Stammdaten beider Offert-Masken (Charge H2).
//
// Erstellen und Bearbeiten laden dasselbe: Funktionen, Materialkatalog,
// Lieferanten, Preisregeln, Montage-Vorlagen und die Feature-Flags des Mandanten
// (samt Sonderpositions-Vorlagen, die nur bei aktivem Flag geholt werden). Das
// stand bis hierher zweimal im Screen — inklusive der drei abgeleiteten Memos für
// die Material-Filter.
//
// Bewusste Abweichung vom Vorzustand: die Projektliste des Erstell-Formulars ist
// NICHT Teil dieses Hooks und hängt damit nicht mehr am selben `Promise.all`.
// Vorher liess ein Fehler beim Projekt-Abruf auch Funktionen und Material leer;
// jetzt fällt nur aus, was wirklich fehlschlägt.

import { useEffect, useMemo, useState } from 'react'
import { getMe } from '../../../api/auth'
import { isFeatureEnabled } from '../../../api/modules'
import { listAllMaterials } from '../../../api/admin/materials'
import { listPricingRules } from '../../../api/admin/pricingRules'
import { listSuppliers } from '../../../api/admin/suppliers'
import { getStaffRoles } from '../../../api/admin/staff'
import { listInstallationTemplates, listSpecialPositionTemplates } from '../../../api/admin/quoteTemplates'
import type { SupplierPricingRule } from '../PdfExtractionReviewModal'
import type { InstallationTpl, Material, SpecialTpl, StaffRole, Supplier } from './quoteTypes'

export interface QuoteMasterData {
  roles: StaffRole[]
  materials: Material[]
  suppliers: Supplier[]
  pricingRules: SupplierPricingRule[]
  installationTemplates: InstallationTpl[]
  specialTemplates: SpecialTpl[]
  // Feature-Flags des Mandanten
  montageEnabled: boolean    // montage_in_produktpreis: Lohnzeile verstecken
  optionalEnabled: boolean   // optionale_positionen: Eventualpositionen
  specialEnabled: boolean    // sonderpositionen: eigene Sektion
  richtoffAvailable: boolean // richtofferte: Typ-Umschalter (nur beim Erstellen)
  // Abgeleitet für die Material-Filter
  supplierMap: Record<string, string>
  supplierOptions: Supplier[]
  categories: string[]
}

export function useQuoteMasterData(): QuoteMasterData {
  const [roles, setRoles] = useState<StaffRole[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [pricingRules, setPricingRules] = useState<SupplierPricingRule[]>([])
  const [installationTemplates, setInstallationTemplates] = useState<InstallationTpl[]>([])
  const [specialTemplates, setSpecialTemplates] = useState<SpecialTpl[]>([])
  const [montageEnabled, setMontageEnabled] = useState(false)
  const [optionalEnabled, setOptionalEnabled] = useState(false)
  const [specialEnabled, setSpecialEnabled] = useState(false)
  const [richtoffAvailable, setRichtoffAvailable] = useState(false)

  useEffect(() => {
    Promise.all([getStaffRoles(), listAllMaterials(), listInstallationTemplates()])
      .then(([r, m, t]) => { setRoles(r); setMaterials(m); setInstallationTemplates(t) })
      .catch(() => {})
    // Lieferanten und Preisregeln sind Beiwerk (Material-Filter bzw. Warengruppe
    // in der manuellen Erfassung) — ein Fehler darf das Formular nicht blockieren.
    listSuppliers().then(setSuppliers).catch(() => {})
    listPricingRules().then(setPricingRules).catch(() => {})
    getMe().then(me => {
      setMontageEnabled(isFeatureEnabled(me, 'montage_in_produktpreis'))
      setOptionalEnabled(isFeatureEnabled(me, 'optionale_positionen'))
      setRichtoffAvailable(isFeatureEnabled(me, 'richtofferte'))
      // Sonderpositionen sind tenant-spezifisch; Vorlagen nur laden wenn aktiv.
      if (!isFeatureEnabled(me, 'sonderpositionen')) return
      setSpecialEnabled(true)
      listSpecialPositionTemplates().then(setSpecialTemplates).catch(() => {})
    }).catch(() => {})
  }, [])

  // Lieferanten-Lookup + Kategorien für die optionalen Material-Filter.
  // Kategorien direkt aus dem (vollständig geladenen) Materialstamm ableiten.
  const supplierMap = useMemo(() => Object.fromEntries(suppliers.map(s => [s.id, s.name])), [suppliers])
  const usedSupplierIds = useMemo(() => new Set(materials.map(m => m.supplier_id).filter(Boolean)), [materials])
  const supplierOptions = useMemo(() => suppliers.filter(s => usedSupplierIds.has(s.id)), [suppliers, usedSupplierIds])
  const categories = useMemo(
    () => [...new Set(materials.map(m => m.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [materials],
  )

  return {
    roles, materials, suppliers, pricingRules, installationTemplates, specialTemplates,
    montageEnabled, optionalEnabled, specialEnabled, richtoffAvailable,
    supplierMap, supplierOptions, categories,
  }
}
