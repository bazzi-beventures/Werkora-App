// Konfetti zum hundertsten abgeschlossenen Projekt.
//
// Zwei Kanonen aus den unteren Ecken plus ein Nachschauer von oben — das ist
// der Unterschied zwischen «es fällt etwas» und «es wird gefeiert»: der Schuss
// gibt den Moment, der Schauer die Dauer.
//
// Die Farben sind die der Baustelle und nicht die der App: Signalgelb,
// Warnorange, Gerüstgrün, dazu zweimal das Werkora-Blau und Weiss. Ein Konfetti
// in Mandantenfarben sähe aus wie ein Ladebalken.

import { fitCanvas, Particle, rand, runScene, type RunHandle } from './particles'

const COLORS = ['#4FA3C9', '#2A7396', '#F5C518', '#F2833E', '#4ADE80', '#FFFFFF', '#E45C6E']

interface Piece extends Particle {
  w: number
  h: number
  color: string
}

function piece(x: number, y: number, vx: number, vy: number, spawnAt = 0): Piece {
  // Ein Drittel Bänder, zwei Drittel Blättchen — gleich grosse Schnipsel sehen
  // aus wie Pixel, die Mischung sieht aus wie Papier.
  const ribbon = Math.random() < 0.32
  return {
    x, y, vx, vy, spawnAt, age: 0,
    rot: rand(0, Math.PI * 2),
    vrot: rand(-9, 9),
    spin: rand(0, Math.PI * 2),
    vspin: rand(5, 11),
    w: ribbon ? rand(3, 5) : rand(6, 11),
    h: ribbon ? rand(12, 20) : rand(5, 9),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }
}

/** Der Wurf: zwei Kanonen von unten, ein Schauer von oben. */
export function confettiBurst(w: number, h: number): Piece[] {
  const out: Piece[] = []
  const cannons = [
    { x: w * 0.06, y: h * 1.02, angle: -Math.PI / 2.55 },
    { x: w * 0.94, y: h * 1.02, angle: -Math.PI + Math.PI / 2.55 },
  ]
  for (const c of cannons) {
    for (let i = 0; i < 70; i++) {
      const a = c.angle + rand(-0.42, 0.42)
      const speed = rand(560, 1000)
      out.push(piece(c.x, c.y, Math.cos(a) * speed, Math.sin(a) * speed))
    }
  }
  for (let i = 0; i < 60; i++) {
    out.push(piece(rand(0, w), rand(-h * 0.9, -10), rand(-40, 40), rand(60, 180)))
  }
  return out
}

function drawPiece(ctx: CanvasRenderingContext2D, p: Particle) {
  const conf = p as Piece
  const flying = p.age - p.spawnAt
  // Die letzte gute Sekunde: statt hart zu verschwinden, wenn ein Blättchen den
  // unteren Rand nicht erreicht, blendet es aus.
  const fade = flying > 3.2 ? Math.max(0, 1 - (flying - 3.2) / 1.1) : 1
  ctx.save()
  ctx.globalAlpha = fade
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  // Das Flattern: das Blättchen dreht sich um die eigene Hochachse aus dem Bild
  // heraus und wieder hinein. Ohne das fallen Rechtecke, nicht Papier.
  ctx.scale(1, Math.cos(p.spin))
  ctx.fillStyle = conf.color
  ctx.fillRect(-conf.w / 2, -conf.h / 2, conf.w, conf.h)
  ctx.restore()
}

/** Startet das Konfetti auf dem Canvas und liefert den Griff zum Abbrechen. */
export function playConfetti(canvas: HTMLCanvasElement): RunHandle {
  const pieces = confettiBurst(canvas.clientWidth, canvas.clientHeight)
  return runScene(canvas, pieces, drawPiece, { gravity: 900, drag: 0.985, maxParticles: 400 })
}

/**
 * Standbild für `prefers-reduced-motion`: dieselben Schnipsel, verstreut und
 * still. Wer Bewegung abgeschaltet hat, soll trotzdem sehen, dass gefeiert wird.
 */
export function drawConfettiStill(canvas: HTMLCanvasElement, count = 90): void {
  const ctx = fitCanvas(canvas)
  if (!ctx) return
  const { clientWidth: w, clientHeight: h } = canvas
  for (let i = 0; i < count; i++) {
    const p = piece(rand(0, w), rand(0, h), 0, 0)
    p.spin = rand(-0.5, 0.5)
    drawPiece(ctx, p)
  }
}
