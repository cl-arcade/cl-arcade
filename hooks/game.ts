// CL Arcade: an arcade cabinet in a pane, run as a `Client` surface module.
// Screens: the arcade (pick a game) → character select → Dino Roar.
//
// Graphics are pixel art drawn with half-block characters: each terminal cell is
// two square-ish pixels, the upper one as the glyph's colour and the lower one as
// its background (▀), so the 14-row field is 28 pixels tall.
//
// The engine (newGame / key / click / press / tick / cells) is pure, with no engine
// dependency, so tests/game.test.mjs drives it in plain Node.

import type { ClientModule, ClientSurface, RenderElement } from 'claude-code'

// ---------------------------------------------------------------- tuning

export const TICK_MS = 50
export const ROWS = 14 // terminal rows of the field
export const PX_H = ROWS * 2 // 28 pixels tall
const FEET = PX_H - 4 // pixel row the feet stand on; rows below are ground
const RUNNER_X = 4
const GRAVITY = 0.16
const JUMP_V = 1.8
const START_SPEED = 1.4 // pixels (= columns) per tick
const MAX_SPEED = 3.2
const SPEED_GAIN = 0.00025 // per pixel run
const DUCK_TICKS = 12 // a terminal has no key-up: a duck lasts 600 ms after the last press; key repeats extend it
const BOOST_MAX = 0.5 // right arrow: up to 50% faster
const BRAKE_MAX = -0.25 // left arrow: up to 25% slower
const BOOST_STEP = 0.15 // per press (key repeat while held)
const BOOST_DECAY = 0.012 // per tick, back toward cruising speed
const ROAR_CHARGE = 1 / 600 // per pixel run
const BLAST_SPEED = 4
const BLAST_LIFE = 14
const OVER_COOLDOWN = 12 // ticks (600 ms) after a death when a jump can't restart, so the score screen is seen
const CLICK_COOLDOWN = 6 // ticks (300 ms) after a screen change when clicks are ignored: no double-click skipping
export const SCREEN_BG = '#15110e' // the cabinet's own screen colour, so the art reads on light terminal themes too

// ---------------------------------------------------------------- palette
// One letter per colour; '.' is transparent.

export const PALETTE: Record<string, string> = {
  g: '#5cc35c', // dino body
  d: '#2f7d32', // dino shade, feet
  l: '#cdeaa8', // belly
  o: '#ff9b2f', // back spikes
  r: '#e53935', // mouth
  w: '#ffffff', // eye white
  k: '#1b1b1b', // pupils, legs
  q: '#d97757', // Clawd
  Q: '#a8553a', // Clawd shade
  p: '#9b6ddb', // beetle shell
  P: '#5b3aa8', // beetle shade
  y: '#ffd54f', // spots, sparks
  R: '#ef5350', // glitch
  D: '#a01818', // glitch wings
  c: '#c9d3db', // cloud
  C: '#9fb0bd', // cloud shade
  G: '#7cb342', // grass
  b: '#7a5a43', // dirt
  s: '#a78b76', // pebbles
  B: '#4fc3f7', // roar blast
  W: '#e1f5fe', // blast core
  K: '#5a5a5a', // locked (coming soon) art
}

export const TEXT = {
  title: '#7fd88f',
  text: '#d7d7d7',
  dim: '#8a8a8a',
  faint: '#5a5a5a',
  hot: '#ff9e64',
  bad: '#ef5350',
  ok: '#7fd88f',
  warn: '#e5c07b',
}
const LIGHTS = ['#ff9b2f', '#ffd54f', '#9b6ddb', '#4fc3f7', '#ef5350', '#7fd88f']

// ---------------------------------------------------------------- sprites
// Bottom row last. Rows are padded to the widest with '.'.

function sprite(rows: string[]): string[] {
  const w = Math.max(...rows.map(r => r.length))
  return rows.map(r => r.padEnd(w, '.'))
}

// Dino: green, light belly, orange back spikes.
const HEAD = ['..........ggggg', '.........ggggggg', '.........ggwkggg']
const BODY = ['..o.o.o..gggg', '.ggggggggggggdd', 'ggggggggllg..d', 'g..gggglllg', '...ggggllg', '...gggggggg']
const DINO_RUN_A = sprite([...HEAD, '.........ggggddd', ...BODY, '..gg......gg', '..dd......dd'])
const DINO_RUN_B = sprite([...HEAD, '.........ggggddd', ...BODY, '....gg..gg', '....dd..dd'])
const DINO_AIR = sprite([...HEAD, '.........ggggddd', ...BODY, '...gg...gg', '....d....d'])
const DINO_ROAR = sprite([
  '..........ggggg',
  '.........ggggggg',
  '.........ggwkggg',
  '.........gggrrrr',
  '..o.o.o..ggggggg',
  ...BODY.slice(1),
  '..gg......gg',
  '..dd......dd',
])
const DINO_DEAD = sprite([
  '..........ggggg',
  '.........ggggggg',
  '.........ggkgkgg',
  '.........ggggddd',
  ...BODY,
  '..gg......gg',
  '..dd......dd',
])
const DUCK_TOP = ['............gggggg', '..o.o.o....ggggwkgg', '.ggggggggggggggggddd', 'ggggggglllllgg', 'g..gggglllllg']
const DINO_DUCK_A = sprite([...DUCK_TOP, '..gg.......gg', '..dd.......dd'])
const DINO_DUCK_B = sprite([...DUCK_TOP, '....gg...gg', '....dd...dd'])

// Clawd: Claude Code's terracotta mascot, a blocky critter with side nubs and four legs.
const clawdTop = (eyes: [string, string]) => [
  '..qqqqqqqqqq',
  eyes[0],
  eyes[1],
  'qqqqqqqqqqqqqq',
  'qqqqqqqqqqqqqq',
  '..qqqqqqqqqq',
  '..QQQQQQQQQQ',
]
const EYES_OPEN: [string, string] = ['..qqkqqqqkqq', '..qqkqqqqkqq']
const EYES_SPARK: [string, string] = ['..qkqkqqkqkq', '..qqqqqqqqqq'] // ^ ^
const EYES_DEAD: [string, string] = ['..qkqkqqkqkq', '..qqkqqqqkqq'] // x x
const CLAWD_RUN_A = sprite([...clawdTop(EYES_OPEN), '..Q..Q..Q..Q', '..Q..Q..Q..Q'])
const CLAWD_RUN_B = sprite([...clawdTop(EYES_OPEN), '..Q..Q..Q..Q', '...Q..Q..Q..Q'])
const CLAWD_AIR = sprite([...clawdTop(EYES_OPEN), '...Q.Q..Q.Q', ''])
const CLAWD_SPARK = sprite([...clawdTop(EYES_SPARK), '..Q..Q..Q..Q', '..Q..Q..Q..Q'])
const CLAWD_DEAD = sprite([...clawdTop(EYES_DEAD), '..Q..Q..Q..Q', '..Q..Q..Q..Q'])
const CLAWD_DUCK_TOP = ['.qqqqqqqqqqqqqq', '.qqqkqqqqqqkqqq', 'qqqqqqqqqqqqqqqq', '.QQQQQQQQQQQQQQ']
const CLAWD_DUCK_A = sprite([...CLAWD_DUCK_TOP, '..Q..Q....Q..Q', '..Q..Q....Q..Q'])
const CLAWD_DUCK_B = sprite([...CLAWD_DUCK_TOP, '..Q..Q....Q..Q', '...Q..Q....Q..Q'])

const BLAST = sprite(['B', '.BW', '..BW', '..BW', '.BW', 'B'])
const SPARK = sprite(['..y', '.qWq', 'yWWWy', '.qWq', '..y'])

export type CharId = 'dino' | 'clawd'
type Runner = {
  name: string
  move: string // the special move on R
  run: [string[], string[]]
  air: string[]
  duck: [string[], string[]]
  special: string[]
  dead: string[]
  blast: string[]
}
export const RUNNERS: Record<CharId, Runner> = {
  dino: {
    name: 'DINO',
    move: 'ROAR',
    run: [DINO_RUN_A, DINO_RUN_B],
    air: DINO_AIR,
    duck: [DINO_DUCK_A, DINO_DUCK_B],
    special: DINO_ROAR,
    dead: DINO_DEAD,
    blast: BLAST,
  },
  clawd: {
    name: 'CLAWD',
    move: 'SPARK',
    run: [CLAWD_RUN_A, CLAWD_RUN_B],
    air: CLAWD_AIR,
    duck: [CLAWD_DUCK_A, CLAWD_DUCK_B],
    special: CLAWD_SPARK,
    dead: CLAWD_DEAD,
    blast: SPARK,
  },
}
export const CHAR_IDS: CharId[] = ['dino', 'clawd']

const BUG = sprite(['..k....k', '...kPPk', '..PpppppP', '.PpyppypP', '.PppppppP', '..k.k.k.k'])
const BIG_BUG = sprite([
  '.k.........k',
  '..k..PPP..k',
  '...kPPPPPk',
  '..PpppppppP',
  '.PppyppppypP',
  '.PpppppppppP',
  '.PppyppppypP',
  '..k.k..k..k.k',
])
const TWIN_BUGS = sprite(BUG.map(r => r.padEnd(9, '.') + r))
const GLITCH_A = sprite(['D........D', 'DD.RRRR.DD', '.DRwkwkRD', '..RRRRRR', '...R..R'])
const GLITCH_B = sprite(['', '...RRRR', 'DDRwkwkRDD', 'D.RRRRRR.D', '...R..R'])
const CLOUD = sprite(['...cccc', '.cccccccc', 'cccccccccccc', '.CCCCCCCCC'])
const POOF = sprite(['y..o..y', '.y.o.y', 'ooyWyoo', '.y.o.y', 'y..o..y'])

// Arcade cabinet icons (6 px tall at most).
const MINI_DINO = sprite(['......ggg', '.....ggkg', 'o.o.ggg', 'gggggg', '.gggg', '.g..g'])
const TOWER = sprite(['...yy', '...yy', '..pppp', '..pppp', '.BBBBBB', '.BBBBBB'])

type Kind = 'bug' | 'bigbug' | 'bugs' | 'glitch' | 'glitchHigh'

const LOOKS: Record<Kind, string[][]> = {
  bug: [BUG],
  bigbug: [BIG_BUG],
  bugs: [TWIN_BUGS],
  glitch: [GLITCH_A, GLITCH_B],
  glitchHigh: [GLITCH_A, GLITCH_B],
}
// Pixels between the ground and the obstacle's bottom row. A low glitch hits a
// standing runner (10-12 px) and clears a ducking one (6-7 px); a high one clears
// a standing runner and catches a jump.
const HEIGHT: Record<Kind, number> = { bug: 0, bigbug: 0, bugs: 0, glitch: 8, glitchHigh: 13 }
// The slowest world speed at which one jump clears each ground obstacle with at
// least 200 ms of timing slack (measured: see tests/game.test.mjs). Wide bugs only
// spawn once cruising this fast, and the brake can't go below it while one is ahead.
export const CLEAR_SPEED: Partial<Record<Kind, number>> = { bug: 1.1, bigbug: 1.8, bugs: 1.9 }

// ---------------------------------------------------------------- the arcade

export const GAMES = [
  { name: 'DINO ROAR', short: 'DINO ROAR', tag: 'run · jump · roar', isReady: true, icon: MINI_DINO },
  { name: 'BUG BLASTER', short: 'BUG BLAST', tag: 'COMING SOON', isReady: false, icon: BUG },
  { name: 'TOKEN TOWER', short: 'TOKENS', tag: 'COMING SOON', isReady: false, icon: TOWER },
]

// 3x5 pixel font for titles.
const FONT: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'], // 4 wide: a 3-wide N reads as a lowercase n
  P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  ' ': ['..', '..', '..', '..', '..'],
}
const TITLE_COLOURS = ['o', 'y', 'q', 'p', 'B', 'G']

// ---------------------------------------------------------------- state

export type Obstacle = { kind: Kind; x: number; h: number }
export type Mode = 'ready' | 'run' | 'paused' | 'over'
export type Screen = 'arcade' | 'select' | 'game'
export type Claude = { state: 'idle' | 'working' | 'done'; seq: number }

export type Game = {
  screen: Screen
  menu: number // highlighted cabinet
  pick: number // highlighted runner on the select screen
  character: CharId
  flash: number // ticks left to show the "coming soon" message
  clock: number // ticks since the cabinet was switched on, for blinking lights
  screenAt: number // clock at the last screen change
  overAt: number // clock at the last death
  mode: Mode
  banner: 'none' | 'claude-done' | 'paused'
  hasKeys: boolean // a click has given the cabinet the keyboard
  t: number
  dist: number
  score: number
  bonus: number
  speed: number // what the world moves at: cruising speed with boost or brake
  base: number // cruising speed, rising with distance
  boost: number // BRAKE_MAX..BOOST_MAX
  y: number
  vy: number
  duck: number
  roar: number // 0..1 charge of the special move
  roarAnim: number
  blast: { x: number; life: number } | null
  poof: { x: number; h: number; life: number } | null
  obs: Obstacle[]
  nextGap: number
  clouds: { x: number; y: number }[]
  seed: number
  best: number
  claude: Claude
  claudeTicks: number // ticks since Claude's state last changed
  newBest: boolean
}

function rand(g: Game): number {
  // mulberry32 (Tommy Ettinger, public domain): deterministic per seed, so tests replay exactly
  g.seed = (g.seed + 0x6d2b79f5) | 0
  let t = g.seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function newGame(
  seed = 1,
  best = 0,
  claude: Claude = { state: 'idle', seq: 0 },
  character: CharId = 'dino',
): Game {
  const g: Game = {
    screen: 'arcade',
    menu: 0,
    pick: Math.max(0, CHAR_IDS.indexOf(character)),
    character,
    flash: 0,
    clock: 0,
    screenAt: -CLICK_COOLDOWN,
    overAt: -OVER_COOLDOWN,
    mode: 'ready',
    banner: 'none',
    hasKeys: false,
    t: 0,
    dist: 0,
    score: 0,
    bonus: 0,
    speed: START_SPEED,
    base: START_SPEED,
    boost: 0,
    y: 0,
    vy: 0,
    duck: 0,
    roar: 0.5,
    roarAnim: 0,
    blast: null,
    poof: null,
    obs: [],
    nextGap: 70,
    clouds: [],
    seed,
    best,
    claude,
    claudeTicks: 0,
    newBest: false,
  }
  for (let i = 0; i < 3; i++) g.clouds.push({ x: 20 + i * 35 + rand(g) * 15, y: 1 + Math.floor(rand(g) * 5) })
  return g
}

/** A fresh run of Dino Roar as `character`, waiting on its ready screen. */
export function play(g: Game, character: CharId = g.character): Game {
  const fresh = newGame(g.seed, g.best, g.claude, character)
  fresh.claudeTicks = g.claudeTicks
  fresh.clock = g.clock
  fresh.screenAt = g.screen === 'game' ? g.screenAt : g.clock
  fresh.hasKeys = g.hasKeys
  fresh.menu = g.menu
  fresh.screen = 'game'
  Object.assign(g, fresh)
  return g
}

function go(g: Game, screen: Screen): void {
  g.screen = screen
  g.screenAt = g.clock
}

function restart(g: Game): void {
  play(g)
  g.mode = 'run'
}

// ---------------------------------------------------------------- input

export type Action = 'jump' | 'duck' | 'faster' | 'slower' | 'roar' | 'pause' | 'enter'

export function keyToAction(key: string): Action | null {
  switch (key.toLowerCase()) {
    case ' ':
    case 'space':
    case 'up':
    case 'w':
    case 'k':
      return 'jump'
    case 'down':
    case 's':
    case 'j':
      return 'duck'
    case 'right':
    case 'd':
    case 'l':
      return 'faster'
    case 'left':
    case 'a':
    case 'h':
      return 'slower'
    case 'r':
      return 'roar'
    case 'p':
      return 'pause'
    case 'return':
    case 'enter':
      return 'enter'
    default:
      return null
  }
}

const PREV = new Set(['left', 'up', 'a', 'w', 'h', 'k'])
const NEXT = new Set(['right', 'down', 'd', 's', 'l', 'j'])
const OK = new Set([' ', 'space', 'return', 'enter'])
const BACK = new Set(['backspace', 'delete', 'b', 'm', 'q'])
// The clickable label at the HUD's left edge on the select and game screens.
export const BACK_LABEL = { select: '◀ BACK', game: '◀ MENU' } as const

function chooseGame(g: Game): void {
  if (GAMES[g.menu]?.isReady) go(g, 'select')
  else g.flash = 40
}

function chooseRunner(g: Game): void {
  play(g, CHAR_IDS[g.pick] ?? 'dino')
}

/** One key, as the terminal names it, on whatever screen is up. */
export function key(g: Game, raw: string): void {
  const k = String(raw ?? '').toLowerCase()
  g.hasKeys = true
  if (g.screen === 'arcade') {
    // Moving on clears a "coming soon" message: it names the highlighted game, so it would go stale.
    if (PREV.has(k)) (g.menu = (g.menu + GAMES.length - 1) % GAMES.length), (g.flash = 0)
    else if (NEXT.has(k)) (g.menu = (g.menu + 1) % GAMES.length), (g.flash = 0)
    else if (OK.has(k)) chooseGame(g)
    return
  }
  if (g.screen === 'select') {
    if (PREV.has(k) || NEXT.has(k)) g.pick = (g.pick + 1) % CHAR_IDS.length
    else if (OK.has(k)) chooseRunner(g)
    else if (BACK.has(k)) go(g, 'arcade')
    return
  }
  if (BACK.has(k)) return leaveGame(g)
  const a = keyToAction(k)
  if (a) press(g, a)
}

/** Back to the runner select, at any moment; a run quit mid-way still counts toward the best. */
function leaveGame(g: Game): void {
  if (g.score > g.best) g.best = g.score
  go(g, 'select')
  g.mode = 'ready'
}

/** A click at cell (x, row) of the field (row 0 is the field's top; row -1 is the HUD). */
export function click(g: Game, x: number, row: number, width: number): void {
  if (g.clock - g.screenAt < CLICK_COOLDOWN) return // the second half of a double-click
  if (row < 0 && g.screen !== 'arcade' && x < BACK_LABEL[g.screen].length + 1) {
    g.hasKeys = true
    if (g.screen === 'select') go(g, 'arcade')
    else leaveGame(g)
    return
  }
  if (!g.hasKeys) {
    g.hasKeys = true // the first click inserts the coin: it gives the cabinet the keys
    if (g.screen !== 'game') return
  }
  if (g.screen === 'arcade') {
    const i = cardLayout(width).findIndex(c => x >= c.x0 && x < c.x0 + c.w)
    if (i >= 0 && row >= CARD_TOP && row <= CARD_BOTTOM) {
      g.menu = i
      chooseGame(g)
    }
    return
  }
  if (g.screen === 'select') {
    const i = portraitLayout(width).findIndex(c => x >= c.x0 && x < c.x0 + c.w)
    if (i >= 0 && row >= 3) {
      g.pick = i
      chooseRunner(g)
    }
    return
  }
  press(g, 'jump')
}

const onGround = (g: Game) => g.y <= 0 && g.vy <= 0

/** One game action on the Dino Roar screen. */
export function press(g: Game, a: Action): void {
  g.hasKeys = true
  if (g.mode === 'ready') {
    if (a === 'jump' || a === 'enter') g.mode = 'run'
    if (a === 'jump') doJump(g)
    return
  }
  if (g.mode === 'over') {
    // A jump pressed a moment too late (or a held key) shouldn't skip the score screen.
    if ((a === 'jump' || a === 'enter') && g.clock - g.overAt >= OVER_COOLDOWN) restart(g)
    return
  }
  if (g.mode === 'paused') {
    if (a === 'jump' || a === 'enter' || a === 'pause') {
      g.mode = 'run'
      g.banner = 'none'
    }
    return
  }
  switch (a) {
    case 'jump':
      doJump(g)
      break
    case 'duck':
      if (onGround(g)) g.duck = DUCK_TICKS
      else g.vy = Math.min(g.vy, 0) - 1.2 // fast fall
      break
    case 'faster':
      g.boost = Math.min(BOOST_MAX, Math.max(0, g.boost) + BOOST_STEP)
      break
    case 'slower':
      g.boost = Math.max(BRAKE_MAX, Math.min(0, g.boost) - BOOST_STEP)
      break
    case 'roar':
      if (g.roar >= 1 && !g.blast) {
        g.roar = 0
        g.roarAnim = 6
        g.blast = { x: RUNNER_X + 14, life: BLAST_LIFE }
      }
      break
    case 'pause':
      g.mode = 'paused'
      g.banner = 'paused'
      break
    case 'enter':
      break
  }
}

function doJump(g: Game): void {
  if (!onGround(g)) return
  g.vy = JUMP_V
  g.duck = 0
}

/** Claude's state as the hooks module last saw it; pauses a run when Claude finishes. */
export function setClaude(g: Game, c: Claude): void {
  if (c.seq === g.claude.seq && c.state === g.claude.state) return
  const wasWorking = g.claude.state === 'working'
  g.claude = c
  g.claudeTicks = 0
  if (c.state === 'done' && wasWorking && g.screen === 'game' && g.mode === 'run') {
    g.mode = 'paused'
    g.banner = 'claude-done'
  }
  if (c.state === 'working' && g.banner === 'claude-done') g.banner = 'paused'
}

// ---------------------------------------------------------------- simulation

export function runnerSprite(g: Game): string[] {
  const r = RUNNERS[g.character]
  if (g.mode === 'over') return r.dead
  const legA = Math.floor(g.t / 3) % 2 === 0
  // Ducking and jumping come first: the special pose is a standing one, and swapping it in
  // mid-duck or mid-jump would change the hitbox under the player.
  if (g.duck > 0 && onGround(g)) return r.duck[legA ? 0 : 1]
  if (!onGround(g)) return r.air
  if (g.roarAnim > 0) return r.special
  if (g.mode !== 'run') return r.run[0]
  return r.run[legA ? 0 : 1]
}

function look(g: Game, o: Obstacle): string[] {
  const frames = LOOKS[o.kind]
  return frames[Math.floor(g.t / 4) % frames.length]!
}

const widthOf = (o: Obstacle) => LOOKS[o.kind][0]![0]!.length

function spawn(g: Game, width: number): void {
  const r = rand(g)
  let kind: Kind = 'bug'
  if (g.base >= CLEAR_SPEED.bigbug! && r < 0.18) kind = 'bigbug'
  else if (g.base >= CLEAR_SPEED.bugs! && r < 0.3) kind = 'bugs'
  else if (g.dist > 500 && r < 0.55) kind = 'glitch'
  else if (g.dist > 1000 && r < 0.7) kind = 'glitchHigh'
  g.obs.push({ kind, x: width + 2, h: HEIGHT[kind] })
  // Room to land and react, even at full boost: a boosted jump covers more ground.
  const airtime = (2 * JUMP_V) / GRAVITY
  g.nextGap = g.base * (airtime * (1 + BOOST_MAX) + 12) + rand(g) * g.base * 30
}

/** The pixels a sprite covers, as "x,y" (y counted from the top of the field). */
function mask(art: string[], x: number, h: number): Set<string> {
  const out = new Set<string>()
  const bottom = FEET - Math.round(h)
  const left = Math.round(x)
  art.forEach((line, i) => {
    const y = bottom - (art.length - 1 - i)
    for (let c = 0; c < line.length; c++) if (line[c] !== '.') out.add(`${left + c},${y}`)
  })
  return out
}

function overlaps(a: Set<string>, b: Set<string>): boolean {
  for (const k of a) if (b.has(k)) return true
  return false
}

export function tick(g: Game, width: number): void {
  g.claudeTicks++
  g.clock++
  if (g.flash > 0) g.flash--
  if (g.screen !== 'game' || g.mode !== 'run') return
  g.t++

  // runner
  if (g.vy !== 0 || g.y > 0) {
    g.y += g.vy
    g.vy -= GRAVITY
    if (g.y <= 0) {
      g.y = 0
      g.vy = 0
    }
  }
  if (g.duck > 0) {
    g.duck--
    // Stay down while a low glitch is still overhead, so it can't catch you on the way up.
    if (g.duck < 2 && g.obs.some(o => o.kind === 'glitch' && o.x < RUNNER_X + 22 && o.x + widthOf(o) > RUNNER_X - 1)) g.duck = 2
  }
  if (g.roarAnim > 0) g.roarAnim--

  // world
  g.base = Math.min(MAX_SPEED, START_SPEED + g.dist * SPEED_GAIN)
  if (g.boost > 0) g.boost = Math.max(0, g.boost - BOOST_DECAY)
  else if (g.boost < 0) g.boost = Math.min(0, g.boost + BOOST_DECAY)
  let floor = 0
  for (const o of g.obs) if (o.x + widthOf(o) > RUNNER_X) floor = Math.max(floor, CLEAR_SPEED[o.kind] ?? 0)
  g.speed = Math.max(g.base * (1 + g.boost), Math.min(g.base, floor))
  g.dist += g.speed
  g.roar = Math.min(1, g.roar + g.speed * ROAR_CHARGE)
  for (const o of g.obs) o.x -= g.speed
  g.obs = g.obs.filter(o => o.x + widthOf(o) > -1)
  for (const c of g.clouds) {
    c.x -= g.speed * 0.2
    if (c.x < -14) {
      c.x = width + rand(g) * 30
      c.y = 1 + Math.floor(rand(g) * 5)
    }
  }
  g.nextGap -= g.speed
  if (g.nextGap <= 0) spawn(g, width)

  // special move: the blast clears the first obstacle it reaches
  if (g.blast) {
    g.blast.x += BLAST_SPEED
    g.blast.life--
    const bx = g.blast.x
    const victim = g.obs.find(o => o.x <= bx + 3 && o.x + widthOf(o) >= bx)
    if (victim) {
      g.obs = g.obs.filter(o => o !== victim)
      g.poof = { x: victim.x, h: victim.h, life: 6 }
      g.bonus += 50
      g.blast = null
    } else if (g.blast.life <= 0 || bx > width) g.blast = null
  }
  if (g.poof && --g.poof.life <= 0) g.poof = null

  g.score = Math.floor(g.dist / 4) + g.bonus

  // collision, pixel-exact
  const me = mask(runnerSprite(g), RUNNER_X, g.y)
  for (const o of g.obs) {
    if (o.x > RUNNER_X + 22) continue
    if (overlaps(me, mask(look(g, o), o.x, o.h))) {
      g.mode = 'over'
      g.overAt = g.clock
      if (g.score > g.best) {
        g.best = g.score
        g.newBest = true
      }
      return
    }
  }
}

// ---------------------------------------------------------------- drawing: pixels

type Px = string[][]

const blank = (width: number): Px => Array.from({ length: PX_H }, () => Array<string>(width).fill('.'))

function paint(px: Px, art: string[], left: number, top: number, locked = false): void {
  art.forEach((line, i) => {
    const row = px[top + i]
    if (!row) return
    for (let k = 0; k < line.length; k++) {
      const c = line[k]!
      if (c !== '.' && left + k >= 0 && left + k < row.length) row[left + k] = locked ? 'K' : c
    }
  })
}

/** Paint `art` with its bottom row `h` pixels above the ground. */
function blit(px: Px, art: string[], x: number, h: number): void {
  paint(px, art, Math.round(x), FEET - Math.round(h) - art.length + 1)
}

export function textArt(text: string, colourShift: number): string[] {
  const rows = ['', '', '', '', '']
  let n = 0
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[' ']!
    const colour = ch === ' ' ? '.' : TITLE_COLOURS[(n++ + colourShift) % TITLE_COLOURS.length]!
    glyph.forEach((line, i) => (rows[i] += line.replaceAll('#', colour) + '.'))
  }
  return rows
}

/** A pixel-font title across the top three rows, or false where the pane is too narrow. */
function title(px: Px, text: string, shift: number): boolean {
  const art = textArt(text, shift)
  const w = art[0]!.length
  const width = px[0]!.length
  if (w > width) return false
  paint(px, art, Math.floor((width - w) / 2), 1)
  return true
}

/** The Dino Roar field as pixel rows of palette letters ('.' transparent). */
export function pixels(g: Game, width: number): Px {
  const px = blank(width)
  for (const c of g.clouds) blit(px, CLOUD, c.x, FEET - (c.y + CLOUD.length - 1))
  // ground: a grass line, then dirt with pebbles that scroll
  const offset = Math.floor(g.dist)
  for (let x = 0; x < width; x++) {
    let n = Math.imul(x + offset, 0x9e3779b1)
    n = Math.imul(n ^ (n >>> 15), 0x85ebca6b)
    const h = (n ^ (n >>> 13)) >>> 0
    px[FEET + 1]![x] = 'G'
    px[FEET + 2]![x] = h % 9 === 0 ? 's' : 'b'
    px[FEET + 3]![x] = h % 13 === 1 ? 's' : 'b'
  }
  for (const o of g.obs) blit(px, look(g, o), o.x, o.h)
  if (g.blast) blit(px, RUNNERS[g.character].blast, g.blast.x, 3)
  if (g.poof) blit(px, POOF, g.poof.x, g.poof.h)
  blit(px, runnerSprite(g), RUNNER_X, g.y)
  return px
}

// ---------------------------------------------------------------- drawing: cells

/** One terminal cell: a glyph, its colour and its background (undefined: the terminal's own). */
export type Cell = { ch: string; fg?: string; bg?: string }

const pxColour = (c: string) => (c === '.' ? undefined : PALETTE[c])

function toCells(px: Px): Cell[][] {
  const width = px[0]!.length
  const rows: Cell[][] = []
  for (let r = 0; r < ROWS; r++) {
    const top = px[r * 2]!
    const bottom = px[r * 2 + 1]!
    const row: Cell[] = []
    for (let x = 0; x < width; x++) {
      const t = pxColour(top[x]!)
      const b = pxColour(bottom[x]!)
      if (!t && !b) row.push({ ch: ' ' })
      else if (t && !b) row.push({ ch: '▀', fg: t })
      else if (!t && b) row.push({ ch: '▄', fg: b })
      else if (t === b) row.push({ ch: '█', fg: t })
      else row.push({ ch: '▀', fg: t, bg: b })
    }
    rows.push(row)
  }
  return rows
}

/** Text at column x of row r, clipped to the row. */
function put(rows: Cell[][], x: number, r: number, text: string, fg: string): void {
  const row = rows[r]
  if (!row) return
  let i = 0
  for (const ch of text) {
    const at = x + i++
    if (at >= 0 && at < row.length) row[at] = { ch, fg }
  }
}

/** Text centred in row r (or in the span x0..x0+w). */
function centre(rows: Cell[][], r: number, text: string, fg: string, x0 = 0, w = rows[0]?.length ?? 0): void {
  const cut = [...text].slice(0, w).join('')
  put(rows, x0 + Math.max(0, Math.floor((w - [...cut].length) / 2)), r, cut, fg)
}

function frame(rows: Cell[][], x0: number, w: number, top: number, bottom: number, fg: string, heavy: boolean): void {
  const [tl, tr, bl, br, hz, vt] = heavy ? ['╔', '╗', '╚', '╝', '═', '║'] : ['╭', '╮', '╰', '╯', '─', '│']
  put(rows, x0, top, tl + hz.repeat(Math.max(0, w - 2)) + tr, fg)
  put(rows, x0, bottom, bl + hz.repeat(Math.max(0, w - 2)) + br, fg)
  for (let r = top + 1; r < bottom; r++) {
    put(rows, x0, r, vt, fg)
    put(rows, x0 + w - 1, r, vt, fg)
  }
}

const blink = (g: Game, every = 8) => Math.floor(g.clock / every) % 2 === 0

// The arcade: cabinets in a row.
const CARD_TOP = 4
const CARD_BOTTOM = 10

function cardLayout(width: number): { x0: number; w: number }[] {
  const gap = 2
  const w = Math.max(12, Math.floor((width - 2 - gap * 2) / GAMES.length))
  const total = w * GAMES.length + gap * (GAMES.length - 1)
  const x0 = Math.max(0, Math.floor((width - total) / 2))
  return GAMES.map((_, i) => ({ x0: x0 + i * (w + gap), w }))
}

function arcadeCells(g: Game, width: number): Cell[][] {
  const px = blank(width)
  const hasTitle = title(px, 'CL ARCADE', Math.floor(g.clock / 6))
  const cards = cardLayout(width)
  GAMES.forEach((game, i) => {
    const c = cards[i]!
    const icon = game.icon
    const left = c.x0 + Math.floor((c.w - icon[0]!.length) / 2)
    paint(px, icon, left, (CARD_TOP + 1) * 2 + (6 - icon.length), !game.isReady)
  })
  const rows = toCells(px)
  if (!hasTitle) centre(rows, 1, 'C L   A R C A D E', TEXT.hot)

  if (!g.hasKeys) {
    if (blink(g)) centre(rows, 3, ' CLICK TO INSERT COIN ', TEXT.hot)
  } else if (g.flash > 0) centre(rows, 3, `${GAMES[g.menu]?.name ?? ''}: COMING SOON, STAY TUNED!`, TEXT.warn)
  else centre(rows, 3, '· choose a game ·', TEXT.dim)

  GAMES.forEach((game, i) => {
    const c = cards[i]!
    const isOn = i === g.menu && g.hasKeys
    const edge = isOn ? (blink(g, 6) ? TEXT.hot : TEXT.warn) : game.isReady ? TEXT.dim : TEXT.faint
    frame(rows, c.x0, c.w, CARD_TOP, CARD_BOTTOM, edge, isOn)
    const room = c.w - 2
    const name = [isOn ? `▶ ${game.name}` : game.name, game.name, game.short].find(n => n.length <= room) ?? game.short
    centre(rows, 8, name, game.isReady ? (isOn ? TEXT.hot : TEXT.text) : TEXT.dim, c.x0 + 1, room)
    centre(rows, 9, game.tag, game.isReady ? TEXT.dim : TEXT.warn, c.x0 + 1, c.w - 2)
  })

  centre(rows, 12, '←/→ choose · SPACE play · or click a cabinet', TEXT.dim)
  // chasing marquee lights
  const shift = Math.floor(g.clock / 3)
  for (let x = 0; x < width; x += 2) put(rows, x, 13, '•', LIGHTS[(x / 2 + shift) % LIGHTS.length]!)
  return rows
}

// Character select: two portraits.
function portraitLayout(width: number): { x0: number; w: number }[] {
  const gap = 4
  const w = Math.min(28, Math.max(16, Math.floor((width - gap - 2) / 2)))
  const x0 = Math.max(0, Math.floor((width - (w * 2 + gap)) / 2))
  return CHAR_IDS.map((_, i) => ({ x0: x0 + i * (w + gap), w }))
}

function selectCells(g: Game, width: number): Cell[][] {
  const px = blank(width)
  const hasTitle = title(px, 'PICK A RUNNER', Math.floor(g.clock / 6))
  const boxes = portraitLayout(width)
  CHAR_IDS.forEach((id, i) => {
    const r = RUNNERS[id]
    const isOn = i === g.pick
    const art = isOn ? r.run[Math.floor(g.clock / 3) % 2]! : r.run[0]
    const b = boxes[i]!
    // stand on row 9's bottom pixel (px 19)
    paint(px, art, b.x0 + Math.floor((b.w - art[0]!.length) / 2), 19 - art.length + 1)
  })
  const rows = toCells(px)
  if (!hasTitle) centre(rows, 1, 'PICK A RUNNER', TEXT.hot)
  CHAR_IDS.forEach((id, i) => {
    const r = RUNNERS[id]
    const isOn = i === g.pick
    const b = boxes[i]!
    frame(rows, b.x0, b.w, 3, 12, isOn ? (blink(g, 6) ? TEXT.hot : TEXT.warn) : TEXT.faint, isOn)
    centre(rows, 10, isOn ? `▶ ${r.name} ◀` : r.name, isOn ? TEXT.hot : TEXT.text, b.x0 + 1, b.w - 2)
    centre(rows, 11, `R: ${r.move}`, TEXT.dim, b.x0 + 1, b.w - 2)
  })
  centre(rows, 13, '←/→ choose · SPACE pick · M back', TEXT.dim)
  return rows
}

function gameCells(g: Game, width: number): Cell[][] {
  const rows = toCells(pixels(g, width))
  const move = RUNNERS[g.character].move.toLowerCase()
  if (g.mode === 'ready') {
    centre(rows, 1, ' D I N O   R O A R ', TEXT.title)
    centre(rows, 3, ` ↑ jump · ↓ duck · ←/→ speed · r ${move} · p pause `, TEXT.text)
    centre(rows, 4, g.hasKeys ? ' press SPACE to start · M menu ' : ' CLICK HERE to play ', TEXT.hot)
  } else if (g.mode === 'over') {
    centre(rows, 1, ' G A M E   O V E R ', TEXT.bad)
    centre(rows, 3, g.newBest ? ` new best: ${g.best}! ` : ` score ${g.score} `, g.newBest ? TEXT.hot : TEXT.text)
    centre(rows, 4, ' SPACE / click to run again · M menu ', TEXT.dim)
  } else if (g.mode === 'paused') {
    if (g.banner === 'claude-done') {
      centre(rows, 1, ' >> Claude is done! << ', TEXT.ok)
      centre(rows, 3, ' Esc: back to the prompt · SPACE: keep playing ', TEXT.text)
    } else centre(rows, 2, ' paused (p / SPACE to go on · M menu) ', TEXT.text)
  }
  return rows
}

/** The field, whatever screen is up, as terminal cells. */
export function cells(g: Game, width: number): Cell[][] {
  if (g.screen === 'arcade') return arcadeCells(g, width)
  if (g.screen === 'select') return selectCells(g, width)
  return gameCells(g, width)
}

export type Run = { text: string; fg?: string; bg?: string }

/** Cells merged into runs of one colour pair, so each row is a handful of Text nodes. */
export function runs(row: Cell[]): Run[] {
  const out: Run[] = []
  let lastKey = ''
  for (const c of row) {
    const key = c.ch === ' ' && !c.bg ? 'blank' : `${c.fg}|${c.bg}`
    const last = out[out.length - 1]
    if (last && key === lastKey) last.text += c.ch
    else {
      out.push(key === 'blank' ? { text: c.ch } : { text: c.ch, fg: c.fg, bg: c.bg })
      lastKey = key
    }
  }
  return out
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const clockText = (ticks: number) => {
  const s = Math.floor((ticks * TICK_MS) / 1000)
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`
}

export function hud(g: Game, width: number): Run[] {
  let left: Run[]
  if (g.screen === 'game') {
    const meter = Math.round(g.roar * 5)
    left = [
      { text: BACK_LABEL.game, fg: TEXT.hot },
      { text: `  HI ${String(g.best).padStart(5, '0')}  `, fg: TEXT.dim },
      { text: String(g.score).padStart(5, '0'), fg: TEXT.text },
      { text: `  ${RUNNERS[g.character].move} `, fg: TEXT.dim },
      { text: '■'.repeat(meter), fg: g.roar >= 1 ? TEXT.hot : PALETTE.B },
      { text: '□'.repeat(5 - meter), fg: TEXT.dim },
      g.boost > 0.05 ? { text: '  ▶▶', fg: TEXT.hot } : g.boost < -0.05 ? { text: '  ◀◀', fg: PALETTE.B } : { text: '    ' },
    ]
  } else if (g.screen === 'select') {
    left = [{ text: BACK_LABEL.select, fg: TEXT.hot }, { text: `   HI ${String(g.best).padStart(5, '0')}`, fg: TEXT.dim }]
  } else {
    left = [
      g.hasKeys ? { text: 'CREDIT 01', fg: TEXT.warn } : { text: blink(g) ? 'INSERT COIN' : '           ', fg: TEXT.hot },
      { text: `   HI ${String(g.best).padStart(5, '0')}`, fg: TEXT.dim },
    ]
  }
  let right: Run = { text: '' }
  if (g.claude.state === 'working') right = { text: `Claude working ${clockText(g.claudeTicks)}`, fg: TEXT.warn }
  else if (g.claude.state === 'done') right = { text: 'Claude is done ✓', fg: TEXT.ok }
  const used = left.reduce((n, r) => n + [...r.text].length, 0)
  const gap = width - used - [...right.text].length
  if (gap < 1) return left
  return [...left, { text: ' '.repeat(gap) }, right]
}

// ---------------------------------------------------------------- the Client module

export type GameProps = { claude: Claude; best: number; seed: number; character?: CharId }
const IDLE: Claude = { state: 'idle', seq: 0 }
type Local = { g: Game; n: number }

const ClaudeArcade: ClientModule<GameProps, Local> = (props, surface: ClientSurface<Local>): RenderElement => {
  const { Box, Text } = surface.elements
  let local = surface.state

  if (!local) {
    // First call: build the cabinet, wire input and the frame clock once.
    const g = newGame(props.seed || 1, props.best || 0, props.claude ?? IDLE, props.character ?? 'dino')
    local = { g, n: 0 }
    const redraw = () => surface.setState({ g, n: (surface.state?.n ?? 0) + 1 })
    const widthNow = () => Math.max(40, Math.floor(surface.columns || 70))
    let reported = { best: g.best, character: g.character }
    const report = () => {
      if (g.best > reported.best || (g.screen === 'game' && g.character !== reported.character)) {
        reported = { best: g.best, character: g.character }
        surface.post(reported)
      }
    }
    surface.onKey(e => {
      if (e.ctrl || e.meta) return
      key(g, String(e.key ?? ''))
      report()
      redraw()
    })
    surface.onPointer(e => {
      if (e.type === 'down' && e.button !== 'right') {
        click(g, e.x, e.y - 1, widthNow()) // row 0 of the region is the HUD: -1 here
        report()
        redraw()
      }
    })
    surface.every(TICK_MS, () => {
      const before = g.mode
      tick(g, widthNow())
      report()
      // A run draws every frame; menus animate at 5 fps; idle screens once a second.
      const isRunning = g.screen === 'game' && g.mode === 'run'
      if (isRunning || g.mode !== before || (g.screen !== 'game' && g.clock % 4 === 0) || g.claudeTicks % 20 === 0) {
        redraw()
      }
    })
    surface.setState(local)
  }

  const g = local.g
  setClaude(g, props.claude ?? IDLE)
  if (Number.isSafeInteger(props.best) && props.best > g.best) g.best = props.best

  const width = Math.max(40, Math.floor(surface.columns || 70))
  const line = (parts: Run[]) =>
    Text({
      wrap: 'truncate',
      mono: true, // the desktop app draws in a proportional face unless asked; runs inherit it
      children: parts.map(p =>
        Text({
          ...(p.fg ? { color: p.fg } : {}),
          ...(p.bg ? { backgroundColor: p.bg } : {}),
          children: p.text,
        }),
      ),
    })

  return Box({
    flexDirection: 'column',
    backgroundColor: SCREEN_BG,
    children: [line(hud(g, width)), ...cells(g, width).map(row => line(runs(row)))],
  })
}

export default ClaudeArcade
