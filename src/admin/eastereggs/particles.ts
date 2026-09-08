// Gemeinsames Handwerk der beiden Easteregg-Animationen.
//
// Beide sind Partikelsysteme auf einem <canvas>: Konfetti-Blättchen und
// Banknoten unterscheiden sich nur im Aussehen und in den Startwerten, nicht in
// der Physik. Deshalb liegen Schritt und Schleife hier und nicht zweimal
// daneben.
//
// Canvas statt DOM-Elementen oder SVG: 200 Knoten, die 60-mal je Sekunde ihre
// Transform ändern, kosten Layout- und Paint-Arbeit im Hauptdokument der
// Admin-App. Ein Canvas ist ein Knoten.

/** Ein Partikel. `spawnAt` ist die Sekunde seit Start, ab der es fliegt. */
export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** Drehung in der Bildebene (rad). */
  rot: number
  vrot: number
  /** Phase des Taumelns um die Hochachse — daraus wird die x-Stauchung. */
  spin: number
  vspin: number
  spawnAt: number
  /** Sekunden, die dieses Partikel schon fliegt (für das Ausblenden). */
  age: number
}

export interface StepOptions {
  /** Fallbeschleunigung in px/s². */
  gravity: number
  /** Luftwiderstand je Sekunde, als Faktor auf vx (1 = keiner). */
  drag: number
  /** Alles unterhalb dieser Höhe ist aus dem Bild. */
  floor: number
}

/**
 * Rechnet EIN Partikel einen Zeitschritt weiter.
 *
 * Rein und ohne Canvas, damit die Physik prüfbar bleibt: dass etwas fällt,
 * seitlich abgebremst wird und irgendwann unten ankommt, ist die Eigenschaft,
 * an der die Animation hängt — und die man sonst nur am Auge testen könnte.
 *
 * Rückgabe: `false`, sobald das Partikel unter `floor` liegt und nicht mehr
 * gezeichnet werden muss.
 */
export function stepParticle(p: Particle, dt: number, o: StepOptions): boolean {
  p.age += dt
  if (p.age < p.spawnAt) return true
  p.vy += o.gravity * dt
  p.vx *= o.drag
  p.x += p.vx * dt
  p.y += p.vy * dt
  p.rot += p.vrot * dt
  p.spin += p.vspin * dt
  return p.y <= o.floor
}

/** Zufallszahl in [a, b). Einzige Zufallsquelle beider Animationen. */
export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

/**
 * Setzt die Canvas-Grösse auf die CSS-Grösse mal Pixeldichte und liefert den
 * Kontext, in dem wieder in CSS-Pixeln gerechnet werden kann.
 *
 * Ohne das ist die Animation auf jedem Retina-Display unscharf. Die Dichte ist
 * bei 2 gedeckelt: darüber wächst nur die Füllrate, nicht das Bild.
 */
export function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.max(1, Math.round(rect.width * dpr))
  canvas.height = Math.max(1, Math.round(rect.height * dpr))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

export interface RunHandle {
  /** Wirft weitere Partikel in die laufende Szene. */
  add: (particles: Particle[]) => void
  /** Bricht ab und räumt das Canvas. */
  stop: () => void
}

/**
 * Treibt eine Szene bis das letzte Partikel unten ist.
 *
 * `add` erlaubt Nachschub im Lauf — davon lebt das antippbare Emoji: die neuen
 * Noten kommen zum Regen dazu, statt ihn neu zu starten. `spawnAt` der
 * Nachzügler zählt ab ihrem eigenen Einwurf, deshalb bekommen sie die
 * verstrichene Zeit aufgeschlagen.
 */
export function runScene(
  canvas: HTMLCanvasElement,
  initial: Particle[],
  draw: (ctx: CanvasRenderingContext2D, p: Particle) => void,
  options: Omit<StepOptions, 'floor'> & { maxParticles: number },
): RunHandle {
  const ctx = fitCanvas(canvas)
  if (!ctx) return { add: () => {}, stop: () => {} }

  let particles = initial
  let raf = 0
  let last = 0
  let elapsed = 0
  let stopped = false

  const clear = () => ctx.clearRect(0, 0, canvas.width, canvas.height)

  const frame = (ts: number) => {
    if (stopped) return
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016
    last = ts
    elapsed += dt
    clear()

    const opts: StepOptions = { ...options, floor: canvas.clientHeight + 80 }
    const alive: Particle[] = []
    for (const p of particles) {
      if (!stepParticle(p, dt, opts)) continue
      alive.push(p)
      if (p.age >= p.spawnAt) draw(ctx, p)
    }
    particles = alive

    if (particles.length > 0) {
      raf = requestAnimationFrame(frame)
    } else {
      raf = 0
      clear()
    }
  }

  raf = requestAnimationFrame(frame)

  return {
    add: (extra) => {
      if (stopped) return
      const room = Math.max(0, options.maxParticles - particles.length)
      for (const p of extra.slice(0, room)) {
        particles.push({ ...p, spawnAt: elapsed + p.spawnAt, age: elapsed })
      }
      if (!raf) {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    },
    stop: () => {
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      particles = []
      clear()
    },
  }
}
