// The landing page's live demo: the plugin's own engine (game.js, built from hooks/game.ts),
// drawn on a canvas instead of a terminal. Each half-block cell becomes two square pixels.
import { newGame, key, click, tick, cells, hud, setClaude, TICK_MS, ROWS, PALETTE, RUNNERS, GAMES, SCREEN_BG } from './game.js'

// ------------------------------------------------------------ copy buttons
// Wired first, so they work even if the demo below fails. The text copied is read from the
// visible command, so what people see is exactly what they paste.

const commandOf = code =>
  [...code.querySelectorAll('.line')].map(l => l.textContent.replace(/^>\s*/, '').trim()).join(' ')

for (const btn of document.querySelectorAll('.copy')) {
  btn.addEventListener('click', async () => {
    const code = btn.parentElement.querySelector('code')
    const text = commandOf(code)
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      const t = document.createElement('textarea')
      t.value = text
      t.setAttribute('readonly', '')
      t.style.position = 'fixed'
      t.style.opacity = '0'
      document.body.append(t)
      t.select()
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      }
      t.remove()
    }
    if (!ok) {
      // Leave the command selected so it can be copied by hand.
      const range = document.createRange()
      range.selectNodeContents(code)
      getSelection()?.removeAllRanges()
      getSelection()?.addRange(range)
    }
    btn.textContent = ok ? 'copied!' : 'select & copy'
    setTimeout(() => (btn.textContent = 'copy'), 1800)
  })
}

// ------------------------------------------------------------ the arcade

const HEIGHT_ROWS = ROWS + 1 // HUD + field
const BEST_KEY = 'cl-arcade-best'
const MAX_SCORE = 9_999_999
const AUTO_FINISH_TICKS = 800 // the demo's Claude "finishes" after 40 s of actual play

const store = {
  get(k) {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* private mode: fine */
    }
  },
}

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const canvas = document.getElementById('arcade')
const ctx = canvas.getContext('2d')
const hint = document.getElementById('prompt-hint')
const claudeLine = document.getElementById('claude-line')
const finishBtn = document.getElementById('finish')

// Every Pages site of the same account shares this origin's storage: treat the saved best as untrusted.
const saved = Number(store.get(BEST_KEY))
const g = newGame(Date.now() % 2147483647 || 1, Number.isSafeInteger(saved) && saved >= 0 && saved <= MAX_SCORE ? saved : 0)
let claude = { state: 'working', seq: 1 }
setClaude(g, claude)
let playTicks = 0 // ticks of actual play since the demo's Claude "started working"

const running = () => g.screen === 'game' && g.mode === 'run'

let cols = 70
let cw = 8 // backing-store pixels per cell, across
let chh = 16 // and down: two square pixels per cell
let laidOutFor = -1

function layout() {
  const cssWidth = canvas.parentElement.clientWidth - 12
  if (cssWidth === laidOutFor) return false
  laidOutFor = cssWidth
  cols = Math.max(40, Math.min(76, Math.floor(cssWidth / 7.2)))
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  cw = Math.max(4, Math.round((cssWidth / cols) * dpr))
  chh = cw * 2
  canvas.width = cols * cw
  canvas.height = HEIGHT_ROWS * chh
  return true
}

const font = () => `500 ${Math.round(chh * 0.62)}px "Geist Mono", ui-monospace, Menlo, monospace`

function drawText(ch, x, y, fg, bg) {
  if (bg) {
    ctx.fillStyle = bg
    ctx.fillRect(x, y, cw, chh)
  }
  if (ch === ' ') return
  ctx.fillStyle = fg || '#d7d7d7'
  ctx.fillText(ch, x + cw / 2, y + chh / 2 + 1)
}

function drawCell(c, x, y) {
  const half = chh / 2
  if (c.ch === '▀' || c.ch === '▄' || c.ch === '█') {
    const top = c.ch === '▄' ? c.bg : c.fg
    const bottom = c.ch === '▀' ? c.bg : c.fg
    if (top) {
      ctx.fillStyle = top
      ctx.fillRect(x, y, cw, half)
    }
    if (bottom) {
      ctx.fillStyle = bottom
      ctx.fillRect(x, y + half, cw, half)
    }
    return
  }
  drawText(c.ch, x, y, c.fg, c.bg)
}

function draw() {
  ctx.fillStyle = SCREEN_BG
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.font = font()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let x = 0
  for (const run of hud(g, cols)) {
    for (const ch of run.text) {
      if (x >= cols) break
      drawText(ch, x * cw, 0, run.fg, run.bg)
      x++
    }
  }
  cells(g, cols).forEach((row, r) => {
    row.forEach((c, i) => drawCell(c, i * cw, (r + 1) * chh))
  })
}

function setClaudeState(state) {
  claude = { state, seq: claude.seq + 1 }
  setClaude(g, claude)
  if (state === 'done') {
    claudeLine.innerHTML = '<span>⏺ Done. Billing module split in three, 24 tests passing.</span>'
    finishBtn.textContent = '↻ ask Claude something else'
  } else {
    playTicks = 0
    claudeLine.innerHTML = '<span class="working">✻ Working… (esc to interrupt)</span>'
    finishBtn.textContent = '✓ pretend Claude finished'
  }
}

function updateHint() {
  if (!g.hasKeys) hint.textContent = 'click the arcade to insert a coin'
  else if (document.activeElement === canvas) hint.textContent = 'arrows + space to play · m menu · esc gives the keys back'
  else hint.textContent = 'click the arcade to play'
}

let onScreen = true
if ('IntersectionObserver' in window) {
  new IntersectionObserver(entries => (onScreen = entries.some(e => e.isIntersecting))).observe(canvas)
}

let lastBest = g.best
let frames = 0
function frame() {
  if (document.hidden) return
  if (!onScreen) {
    // Scrolled away mid-run: pause rather than die unseen.
    if (running()) {
      key(g, 'p')
      draw()
    }
    return
  }
  tick(g, cols)
  if (reduceMotion && !running()) g.clock = 0 // menus hold still: no blinking, no chasing lights
  if (running()) playTicks++
  if (claude.state === 'working' && playTicks > AUTO_FINISH_TICKS && running()) setClaudeState('done')
  if (g.best > lastBest && g.best <= MAX_SCORE) {
    lastBest = g.best
    store.set(BEST_KEY, String(g.best))
  }
  // A run draws every frame; menus animate at 5 fps, or once a second (the Claude timer) under
  // reduced motion. Input draws at once, from its own handlers.
  frames++
  if (running() || frames % (reduceMotion ? 20 : 4) === 0) draw()
}

const KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'return',
  Backspace: 'backspace',
  Delete: 'delete',
  ' ': ' ',
}

canvas.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'Escape') {
    canvas.blur()
    return
  }
  const name = KEYS[e.key] ?? (e.key.length === 1 ? e.key.toLowerCase() : null)
  if (!name) return
  e.preventDefault()
  key(g, name)
  updateHint()
  draw()
})

function act(e) {
  const rect = canvas.getBoundingClientRect()
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * cols)
  const row = Math.floor(((e.clientY - rect.top) / rect.height) * HEIGHT_ROWS)
  click(g, x, row - 1, cols)
  updateHint()
  draw()
}

// Mouse, and taps during a run, act at once (a jump can't wait). A touch on a menu waits for the
// click, which the browser doesn't send when the touch turns into a scroll.
let pendingTap = false
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return // right-click is the browser's
  const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen'
  if (!isTouch || running()) {
    e.preventDefault()
    canvas.focus({ preventScroll: true })
    act(e)
  } else {
    pendingTap = true
  }
})
canvas.addEventListener('click', e => {
  if (!pendingTap) return
  pendingTap = false
  canvas.focus({ preventScroll: true })
  act(e)
})
canvas.addEventListener('focus', updateHint)
canvas.addEventListener('blur', () => {
  // Focus went elsewhere mid-run: pause rather than die unseen.
  if (running()) {
    key(g, 'p')
    draw()
  }
  updateHint()
})

// Buttons that act on the game must not take focus from it (that would pause the run).
for (const b of [...document.querySelectorAll('.pad'), finishBtn]) b.addEventListener('mousedown', e => e.preventDefault())

// On-screen pads (phones, or anyone who'd rather click). Duck repeats while held, like a held key.
// Pointer presses act on pointerdown; Enter, Space and assistive tech arrive as a plain click.
for (const pad of document.querySelectorAll('.pad[data-key]')) {
  let timer = null
  let viaPointer = false
  const fire = () => {
    key(g, pad.dataset.key)
    updateHint()
    draw()
  }
  const stop = () => {
    clearInterval(timer)
    timer = null
  }
  pad.addEventListener('pointerdown', e => {
    if (e.button !== 0) return
    e.preventDefault()
    viaPointer = true
    fire()
    if (pad.hasAttribute('data-hold')) {
      stop() // a second finger must not orphan the first repeater
      timer = setInterval(() => key(g, pad.dataset.key), 60)
    }
  })
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) pad.addEventListener(ev, stop)
  pad.addEventListener('click', () => {
    if (viaPointer) {
      viaPointer = false
      return
    }
    fire()
  })
}

finishBtn.addEventListener('click', () => {
  setClaudeState(claude.state === 'working' ? 'done' : 'working')
  if (g.hasKeys) canvas.focus({ preventScroll: true }) // so SPACE goes to the game, not back to this button
  updateHint()
  draw()
})

layout()
draw()
updateHint()
setInterval(frame, TICK_MS)
window.addEventListener('resize', () => {
  if (layout()) draw()
})
document.fonts?.ready.then(draw)
// The box-drawing glyphs only ever appear on the canvas, so ask for that part of the font explicitly.
document.fonts?.load('500 16px "Geist Mono"', '╔═║╭─│•■□▶◀').then(draw, () => {})

// ------------------------------------------------------------ portraits and cabinet art

function paintArt(cv, art, { scale, bottom, ground = false }) {
  const c = cv.getContext('2d')
  c.clearRect(0, 0, cv.width, cv.height)
  const w = art[0].length * scale
  const left = Math.floor((cv.width - w) / 2)
  const top = bottom - art.length * scale
  art.forEach((line, i) => {
    for (let k = 0; k < line.length; k++) {
      const p = line[k]
      if (p === '.') continue
      c.fillStyle = PALETTE[p]
      c.fillRect(left + k * scale, top + i * scale, scale, scale)
    }
  })
  if (ground) {
    c.fillStyle = PALETTE.G
    c.fillRect(0, bottom, cv.width, scale)
    c.fillStyle = PALETTE.b
    c.fillRect(0, bottom + scale, cv.width, cv.height - bottom - scale)
  }
}

const portraits = [...document.querySelectorAll('canvas[data-runner]')]
let step = 0
function animatePortraits() {
  if (document.hidden) return
  for (const cv of portraits) {
    const r = RUNNERS[cv.dataset.runner]
    paintArt(cv, r.run[step % 2], { scale: 3, bottom: 48, ground: true })
  }
  step++
}
animatePortraits()
if (!reduceMotion) setInterval(animatePortraits, 180)

for (const cv of document.querySelectorAll('canvas[data-game]')) {
  const art = GAMES[Number(cv.dataset.game)].icon
  paintArt(cv, art, { scale: 4, bottom: 34 })
}
