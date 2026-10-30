// Betrag für Fliesstext: ab einer Million in «Mio.» (zwei Stellen), sonst ganze
// Franken — «CHF 1.55 Mio.» liest sich im Satz, «CHF 1'552'381» nicht.
export const chfKurz = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `CHF ${(v / 1_000_000).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mio.`
    : `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
