// Geldregen zum überschrittenen Jahresumsatz.
//
// Die Noten tragen die Farben der neunten Schweizer Banknotenserie: 100 blau,
// 200 braun, 1000 violett. Das ist der Unterschied zwischen einem Geldregen und
// einem Regen aus grünen Rechtecken — die Dollarnote ist hier niemandes Geld.
//
// Gezeichnet statt als Bild eingebettet: eine Banknote, die sich beim Fallen um
// die Hochachse dreht, braucht die Stauchung zur Laufzeit. Ein <img> müsste
// dafür in zwanzig Winkelstufen vorliegen.

import { fitCanvas, Particle, rand, runScene, type RunHandle } from './particles'

interface NoteKind {
  value: string
  bg: string
  ink: string
  edge: string
}

const KINDS: NoteKind[] = [
  { value: '100', bg: '#3F7FB8', ink: '#EAF3FA', edge: '#2A5C8A' },
  { value: '200', bg: '#B4763C', ink: '#FBF2E7', edge: '#8A5726' },
  { value: '1000', bg: '#7A5FA8', ink: '#F3EDFA', edge: '#5A4380' },
]

interface Note extends Particle {
  scale: number
  kind: NoteKind
}

const NOTE_W = 46
const NOTE_H = 26

/**
 * Eine Note, geworfen aus der Bildmitte.
 *
 * `spread` verteilt den Einwurf über die ersten Sekunden: alle 90 Noten im
 * selben Frame sähen aus wie eine platzende Tüte, nicht wie Werfen.
 */
function note(w: number, h: number, spread: number): Note {
  return {
    x: w / 2 + rand(-40, 40),
    y: h * 0.52 + rand(-20, 20),
    vx: rand(-420, 420),
    vy: rand(-760, -320),
    rot: rand(0, Math.PI * 2),
    vrot: rand(-6, 6),
    spin: rand(0, Math.PI * 2),
    vspin: rand(3.5, 8),
    spawnAt: rand(0, spread),
    age: 0,
    scale: rand(0.72, 1.15),
    kind: KINDS[Math.floor(Math.random() * KINDS.length)],
  }
}

/** Der grosse Wurf beim Aufgehen des Eis. */
export function moneyBurst(w: number, h: number, count = 90, spread = 2.6): Note[] {
  return Array.from({ length: count }, () => note(w, h, spread))
}

/** Der Nachschlag beim Antippen: weniger Noten, aber alle fast gleichzeitig. */
export function moneyHandful(w: number, h: number, count = 38): Note[] {
  return Array.from({ length: count }, () => note(w, h, 0.22))
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawNote(ctx: CanvasRenderingContext2D, p: Particle) {
  const n = p as Note
  // Taumeln um die Hochachse: die Note zeigt mal die Fläche, mal die Kante.
  // `facing` ist der Cosinus dieser Phase — negativ heisst, wir sehen die
  // RÜCKSEITE. Gestaucht wird deshalb mit dem Betrag und die Rückseite
  // bekommt ihr eigenes Bild: eine mitgespiegelte «100» sähe nicht aus wie
  // eine gedrehte Note, sondern wie ein Zeichenfehler.
  const facing = Math.cos(p.spin)

  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  ctx.scale(n.scale * Math.abs(facing), n.scale)

  roundRect(ctx, -NOTE_W / 2, -NOTE_H / 2, NOTE_W, NOTE_H, 3)
  ctx.fillStyle = n.kind.bg
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = n.kind.edge
  ctx.stroke()

  if (facing >= 0) {
    ctx.fillStyle = n.kind.ink
    ctx.font = "600 11px 'IBM Plex Mono', ui-monospace, monospace"
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(n.kind.value, -NOTE_W / 2 + 5, 0)

    // Schweizerkreuz rechts: zwei Balken, keine Schrift — bei 26 px Höhe ist
    // alles andere ein Fleck.
    const cx = NOTE_W / 2 - 9
    const arm = 5.5
    const bar = 1.9
    ctx.fillRect(cx - arm / 2, -bar / 2, arm, bar)
    ctx.fillRect(cx - bar / 2, -arm / 2, bar, arm)
  } else {
    // Rückseite: nur das Streifenmuster der Serie, keine Schrift.
    ctx.globalAlpha = 0.35
    ctx.fillStyle = n.kind.ink
    ctx.fillRect(-NOTE_W / 2 + 4, -3, NOTE_W - 8, 1.6)
    ctx.fillRect(-NOTE_W / 2 + 4, 1, NOTE_W - 14, 1.6)
  }

  ctx.restore()
}

/** Startet den Geldregen und liefert den Griff für Nachschlag und Abbruch. */
export function playMoneyRain(canvas: HTMLCanvasElement): RunHandle {
  const notes = moneyBurst(canvas.clientWidth, canvas.clientHeight)
  return runScene(canvas, notes, drawNote, { gravity: 780, drag: 0.99, maxParticles: 400 })
}

/** Nachschlag in eine laufende Szene — das antippbare Emoji hängt daran. */
export function throwMore(handle: RunHandle, canvas: HTMLCanvasElement): void {
  handle.add(moneyHandful(canvas.clientWidth, canvas.clientHeight))
}

/** Standbild für `prefers-reduced-motion`. */
export function drawMoneyStill(canvas: HTMLCanvasElement, count = 26): void {
  const ctx = fitCanvas(canvas)
  if (!ctx) return
  const { clientWidth: w, clientHeight: h } = canvas
  for (let i = 0; i < count; i++) {
    const n = note(w, h, 0)
    n.x = rand(20, Math.max(21, w - 20))
    n.y = rand(20, Math.max(21, h - 20))
    n.spin = rand(-0.6, 0.6)
    drawNote(ctx, n)
  }
}
