/**
 * Werkora-Bildmarke — Stoppuhr, Ring in `currentColor`, ein Zeiger in Amber.
 *
 * Nachgezeichnet aus `werkora-mark.png` des Repos `werkora-website` (851x851):
 * Marching-Squares auf dem Alphakanal, danach Douglas-Peucker mit 1,1 px
 * Toleranz. Deckungsgleich zur Vorlage bis auf Kantenquantisierung
 * (Flaechen-IoU 0,978). Ein Vektor-Original der Marke existiert nicht, sonst
 * stuende hier dieses.
 *
 * Der Ring nimmt bewusst `currentColor` statt der Tinte `#12161D`: die Marke
 * steht auf dem Anmelde- und dem Ladescreen, und die muessen in beiden Themes
 * lesbar bleiben. Der Amber-Zeiger bleibt fest — er ist das Wiedererkennungs-
 * merkmal und traegt in beiden Themes.
 *
 * Der Zeiger liegt UNTER dem Ring-Pfad und ist um zwei Quellpixel gedehnt.
 * Ohne diese Ueberlappung blitzt an der Nabe eine Haarlinie Hintergrund durch.
 *
 * Der dunkle Pfad lief urspruenglich als haarduenner Zipfel an beiden Kanten des
 * Amber-Zeigers entlang bis zu dessen Spitze und wieder zurueck — ein Rest des
 * Nachzeichnens, nicht Teil der Marke. Die Hin- und Rueckkante lagen rund 0,2
 * Einheiten auseinander, was der Browser als grauschwarzen Strich laengs des
 * Zeigers ausmalte. Die beiden Ausfluege sind entfernt; wer die Vorlage erneut
 * nachzeichnet, muss sie wieder entfernen.
 */
export const WERKORA_AMBER = '#E9A227'

export function WerkoraMark({ title }: { title?: string }) {
  return (
    <svg viewBox="0 0 64 64" role={title ? 'img' : 'presentation'} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path
        fill={WERKORA_AMBER}
        d={
          'M16.72 22.04L16.85 21.99L18.40 22.86L30.31 29.82L30.50 30.16L29.37 30.98L28.77 31.96' +
            'L28.31 33.17L27.90 33.04L16.39 23.07L16.21 22.71Z'
        }
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d={
          'M31.09 1.20L32.98 1.20L32.94 5.75L31.02 5.72Z' +
            'M25.20 1.96L25.49 1.92L25.68 2.26L28.47 9.02L26.70 9.74L25.34 6.66L23.31 7.26L21.58 7.94' +
            'L19.33 9.06L17.15 10.42L14.67 12.39L12.53 14.51L10.57 17.00L8.99 19.55L7.94 21.73' +
            'L6.96 24.44L6.44 26.40L5.98 29.33L5.83 31.89L5.98 34.75L6.28 36.85L6.88 39.26L7.93 42.19' +
            'L8.69 43.77L10.04 46.10L11.39 47.98L12.75 49.56L14.36 51.18L16.55 52.98L18.20 54.11' +
            'L19.78 55.01L22.34 56.22L26.02 57.42L28.43 57.87L30.83 58.10L33.17 58.10L35.05 57.95' +
            'L37.75 57.49L39.48 57.04L41.74 56.22L44.60 54.86L48.28 52.38L51.63 49.18L52.98 47.53' +
            'L54.49 45.27L55.84 42.72L56.44 41.29L57.27 38.81L57.80 36.47L58.10 34.14L58.17 31.21' +
            'L57.87 28.05L57.27 25.19L56.35 22.41L54.94 19.40L53.66 17.30L52.00 15.12L50.24 13.21' +
            'L47.61 10.95L44.82 9.14L41.51 7.57L38.66 6.66L37.38 9.73L35.61 9.02L38.47 2.03L38.81 1.92' +
            'L39.86 2.22L42.64 3.05L44.82 3.95L47.15 5.15L50.46 7.33L52.49 8.99L55.01 11.51' +
            'L56.22 12.94L58.02 15.49L59.60 18.27L60.58 20.46L61.33 22.49L62.08 25.27L62.61 28.28' +
            'L62.83 31.14L62.76 34.22L62.53 36.32L62.08 38.73L61.25 41.74L60.35 44.07L59.07 46.70' +
            'L57.64 49.03L55.61 51.74L53.55 53.96L51.44 55.84L49.64 57.19L46.93 58.92L44.22 60.28' +
            'L41.29 61.41L38.51 62.16L35.72 62.61L34.07 62.76L30.01 62.76L27.68 62.53L24.59 61.93' +
            'L21.66 61.03L19.63 60.20L17.07 58.92L14.36 57.19L10.98 54.41L8.76 52.12L6.96 49.86' +
            'L5.62 47.83L4.25 45.35L3.20 42.94L2.22 39.93L1.77 38.05L1.32 34.97L1.20 31.96L1.32 29.03' +
            'L1.69 26.32L2.37 23.46L3.05 21.36L4.40 18.27L5.60 16.09L7.11 13.84L8.99 11.51L10.30 10.12' +
            'L12.86 7.86L15.49 5.98L17.67 4.70L19.85 3.65L22.71 2.59Z' +
            'M48.77 16.39L49.00 16.47L49.45 17.07L35.76 32.64L35.76 34.22L35.53 34.97L34.93 35.95' +
            'L34.14 36.66L32.94 37.19L31.44 37.26L30.68 37.04L27.53 40.65L24.71 37.75L28.32 34.59' +
            'L28.24 33.24L28.13 33.05L28.92 31.21L29.25 30.80L30.35 30.01L30.46 29.97' +
            'L31.66 29.67L33.17 29.82Z' +
            'M31.74 31.93L31.14 32.17L30.66 32.64L30.50 33.02L30.50 33.84L30.65 34.22L31.21 34.78' +
            'L31.81 35.01L32.26 34.93L32.86 34.78L33.28 34.37L33.50 33.92L33.58 33.32L33.35 32.64' +
            'L32.86 32.15L32.26 31.92Z'
        }
      />
    </svg>
  )
}
