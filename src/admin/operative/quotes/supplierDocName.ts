// Wie das per OCR eingelesene Lieferanten-PDF im Projekt heisst.
//
// Bis hierher landete es unter dem Namen, den der Lieferant seiner Datei
// mitgegeben hat — «Angebot_2600772.pdf», «download (3).pdf», «myGriesser.pdf».
// In der Dokumentenliste des Projekts steht damit eine Zeile, der man nicht
// ansieht, wozu sie gehört; bei zwei Offerten am selben Projekt gar nicht mehr.
//
// Der Name kommt deshalb aus dem Projekt selbst: Projektnummer und Projektname,
// genau die zwei Angaben, unter denen im Betrieb über einen Auftrag gesprochen
// wird («P26-0424 Bollmann Seuzach»).
//
// Reine Funktionen, kein React und kein Netz — die Namensbildung ist die Sorte
// Regel, die man einmal festschreibt und danach nicht mehr im Kopf nachrechnet.

/** Pfad-Trenner und Windows-Reservate. Bewusst durch ein Leerzeichen ersetzt statt
 *  gelöscht: aus «Meier/Müller» soll «Meier Müller» werden, nicht «MeierMüller».
 *  Bindestrich und Punkt bleiben — die Projektnummer «P26-0424» besteht daraus. */
const UNSAFE = /[/\\:*?"<>|]+/g

/** Deckel für den Namensteil ohne Endung. Projektnamen sind gelegentlich ganze
 *  Sätze; Storage-Pfad und Mail-Anhang wollen keinen 300-Zeichen-Namen. */
const MAX_BASE_LENGTH = 100

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim()
}

/** Endung der Originaldatei (inkl. Punkt), sonst `.pdf`.
 *
 *  Eine Endung muss mindestens einen Buchstaben enthalten: «Angebot 12.03.2026»
 *  endet auf einen Punkt und vier Zeichen, hat aber keine Endung — die Jahreszahl
 *  als Dateityp zu übernehmen, ergäbe eine Datei, die kein Programm öffnet. */
export function fileExtension(filename: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(filename.trim())
  if (!match || !/[A-Za-z]/.test(match[1])) return '.pdf'
  return `.${match[1].toLowerCase()}`
}

export interface SupplierDocProject {
  /** Projektnummer (`project_id_text`) — steht vorn, danach sortiert die Liste. */
  project_id_text?: string | null
  name?: string | null
}

/**
 * Dateiname für ein abgelegtes Lieferanten-PDF: «<Projektnummer> <Projektname>».
 *
 * Fehlt eine der beiden Angaben, bleibt die andere allein stehen — ein Projekt
 * ohne Nummer gibt es (Entwürfe), und ein halber Name ist besser als der
 * Lieferanten-Dateiname. Fehlen beide, bleibt es beim Originalnamen: lieber der
 * Name des Lieferanten als eine Datei, die «.pdf» heisst.
 *
 * `index` nummeriert die Ablage durch, wenn zu einer Offerte mehrere Quell-PDFs
 * gehören (zweiter Lieferant, Nachtrag) — sonst hiessen beide gleich und die
 * Dokumentenliste zeigte zweimal dieselbe Zeile.
 */
export function supplierDocFilename(
  original: string,
  project: SupplierDocProject | null | undefined,
  index = 0,
): string {
  const base = [clean(project?.project_id_text), clean(project?.name)]
    .filter(Boolean)
    .join(' ')
    .slice(0, MAX_BASE_LENGTH)
    .trim()
  if (!base) return original
  const suffix = index > 0 ? ` (${index + 1})` : ''
  return `${base}${suffix}${fileExtension(original)}`
}

/** Neue `File`-Instanz mit dem Ablage-Namen; Inhalt und MIME-Typ bleiben. */
export function renameFile(file: File, filename: string): File {
  if (filename === file.name) return file
  return new File([file], filename, { type: file.type, lastModified: file.lastModified })
}
