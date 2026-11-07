// Headless checks of the game engine: `node tests/game.test.mjs` (Node 22.18+ strips the TS types).
// `node tests/game.test.mjs --look` also prints a few frames as pixel letters.
import assert from 'node:assert/strict'
import { newGame, play, key, click, press, tick, pixels, cells, runs, hud, setClaude, keyToAction, PX_H, ROWS, GAMES } from '../hooks/game.ts'

const W = 70
let failures = 0
const check = (name, fn) => {
  try {
    fn()
    console.log(`ok   ${name}`)
  } catch (err) {
    failures++
    console.log(`FAIL ${name}\n     ${err.message}`)
  }
}

// A Dino Roar run, straight past the arcade and character select.
const fresh = (seed, character = 'dino') => play(newGame(seed), character)

// Let 350 ms pass: clicks right after a screen change are treated as a double-click and ignored.
const wait = (g, n = 7) => { for (let i = 0; i < n; i++) tick(g, W) }

const showPx = g => pixels(g, W).map(r => r.join('')).join('\n')
const showCells = (g, w = W) => cells(g, w).map(r => r.map(c => c.ch).join('')).join('\n')

// One tick with the player's standing input: a held arrow key ('faster' / 'slower') or nothing.
const step = (s, style) => {
  if (style) press(s, style)
  tick(s, W)
}

// Does the run survive `n` ticks from here if we wait `wait` ticks, then do `first`
// (a duck is held: pressed again every tick)? `style` is held throughout.
function survives(g, first, n, wait = 0, style = null) {
  const s = structuredClone(g)
  for (let i = 0; i < wait && s.mode === 'run'; i++) step(s, style)
  if (s.mode !== 'run') return false // pressing now would restart the game, not save it
  if (first) press(s, first)
  for (let i = 0; i < n && s.mode === 'run'; i++) {
    if (first === 'duck' && i > 0) press(s, 'duck')
    step(s, style)
  }
  return s.mode === 'run'
}

// Does `move` after `wait` ticks get the dino past the nearest obstacle ahead and back on its feet?
function clears(g, move, wait, style) {
  const s = structuredClone(g)
  const target = s.obs.filter(o => o.x + 20 > 4).sort((a, b) => a.x - b.x)[0]
  for (let i = 0; i < wait && s.mode === 'run'; i++) step(s, style)
  if (s.mode !== 'run') return false
  press(s, move)
  for (let i = 0; i < 300 && s.mode === 'run'; i++) {
    if (move === 'duck') press(s, 'duck')
    step(s, style)
    const passed = !target || !s.obs.includes(target) || target.x + 20 < 4 // off-screen obstacles are dropped
    if (passed && s.y === 0) break
  }
  return s.mode === 'run'
}

// A planning player: when doing nothing would lose, it makes the move the nearest
// obstacle calls for (duck under a low glitch, jump anything else) as soon as that
// move works. For each move started on the ground it measures the timing slack: how
// many consecutive start ticks, from the first that works, get past the obstacle.
function makeBot(style = null) {
  const windows = []
  let acting = false // mid-move (holding a duck): only the first press of a move is timed
  return {
    windows,
    step(g) {
      if (survives(g, null, 30, 0, style)) return void (acting = false)
      const target = g.obs.filter(o => o.x + 20 > 4).sort((a, b) => a.x - b.x)[0]
      const move = target?.kind === 'glitch' ? 'duck' : 'jump'
      if (!survives(g, move, move === 'duck' ? 12 : 30, 0, style)) {
        if (acting && move === 'duck') press(g, 'duck')
        return
      }
      if (!acting && g.y === 0) {
        let first = 0
        while (first < 12 && !clears(g, move, first, style)) first++
        let slack = 0
        while (first + slack < 16 && clears(g, move, first + slack, style)) slack++
        windows.push(slack)
      }
      acting = true
      press(g, move)
    },
  }
}

check('keys map to actions', () => {
  assert.equal(keyToAction(' '), 'jump')
  assert.equal(keyToAction('up'), 'jump')
  assert.equal(keyToAction('down'), 'duck')
  assert.equal(keyToAction('right'), 'faster')
  assert.equal(keyToAction('left'), 'slower')
  assert.equal(keyToAction('R'), 'roar')
  assert.equal(keyToAction('return'), 'enter')
  assert.equal(keyToAction('x'), null)
})

check('first screen asks for a click; once clicked it says SPACE', () => {
  const g = fresh(7)
  assert.match(showCells(g), /CLICK HERE to play/)
  g.hasKeys = true
  assert.match(showCells(g), /press SPACE to start/)
})

check('ready screen waits; space starts the run', () => {
  const g = fresh(7)
  for (let i = 0; i < 20; i++) tick(g, W)
  assert.equal(g.mode, 'ready')
  assert.equal(g.dist, 0)
  press(g, 'jump')
  assert.equal(g.mode, 'run')
  assert.equal(g.hasKeys, true)
})

check('a jump rises ~11 px, stays in the field, and lands', () => {
  const g = fresh(3)
  press(g, 'enter')
  g.nextGap = 1e9
  press(g, 'jump')
  let peak = 0
  let air = 0
  for (let i = 0; i < 40; i++) {
    tick(g, W)
    peak = Math.max(peak, g.y)
    if (g.y > 0) air++
  }
  assert.ok(peak > 10 && peak < 12, `peak ${peak}`)
  assert.ok(peak + 12 < PX_H - 4, 'head leaves the field')
  assert.ok(air > 18 && air < 26, `airtime ${air} ticks`)
  assert.equal(g.y, 0)
})

check('one Down press keeps the dino down for 600 ms', () => {
  const g = fresh(3)
  press(g, 'enter')
  g.nextGap = 1e9
  press(g, 'duck')
  for (let i = 0; i < 11; i++) tick(g, W)
  assert.ok(g.duck > 0, 'stood up before 550 ms')
  for (let i = 0; i < 2; i++) tick(g, W)
  assert.equal(g.duck, 0)
})

check('ducked under a low glitch, the dino stays down until it has passed', () => {
  for (const speed of [1.4, 2.2, 3.2]) {
    const g = fresh(3)
    press(g, 'enter')
    g.dist = (speed - 1.4) / 0.00025
    g.nextGap = 1e9
    g.obs = [{ kind: 'glitch', x: 30, h: 8 }]
    press(g, 'duck') // once, no repeats
    for (let i = 0; i < 80 && g.mode === 'run'; i++) tick(g, W)
    assert.equal(g.mode, 'run', `hit at speed ${speed}`)
  }
})

check('→ speeds up to +50% and eases back; ← slows down to -25%', () => {
  const g = fresh(3)
  press(g, 'enter')
  g.nextGap = 1e9
  tick(g, W)
  const cruise = g.speed
  for (let i = 0; i < 10; i++) step(g, 'faster')
  assert.ok(Math.abs(g.speed / cruise - 1.5) < 0.03, `boost ${g.speed / cruise}`)
  assert.match(hud(g, W).map(r => r.text).join(''), /▶▶/)
  for (let i = 0; i < 60; i++) tick(g, W)
  assert.ok(Math.abs(g.speed / g.base - 1) < 0.01, 'did not ease back')
  g.dist = 4000 // cruising at 2.4, so the brake isn't floored
  g.obs = []
  for (let i = 0; i < 10; i++) step(g, 'slower')
  assert.ok(Math.abs(g.speed / g.base - 0.75) < 0.03, `brake ${g.speed / g.base}`)
  assert.match(hud(g, W).map(r => r.text).join(''), /◀◀/)
})

check('the brake cannot slow you below what clears a wide bug ahead', () => {
  const g = fresh(3)
  press(g, 'enter')
  g.dist = (2.0 - 1.4) / 0.00025
  g.nextGap = 1e9
  g.obs = [{ kind: 'bigbug', x: 60, h: 0 }]
  for (let i = 0; i < 10; i++) step(g, 'slower')
  assert.ok(g.speed >= 1.8 - 1e-9, `speed ${g.speed}`)
})

check('standing still, the dino hits a bug and the game ends', () => {
  const g = fresh(11)
  press(g, 'enter')
  let i = 0
  while (g.mode === 'run' && i++ < 3000) tick(g, W)
  assert.equal(g.mode, 'over')
  assert.ok(g.score > 0)
  assert.equal(g.best, g.score)
})

const seen = new Set()
for (const character of ['dino', 'clawd'])
for (const [style, label] of [[null, 'cruising'], ['faster', 'holding →'], ['slower', 'holding ←']]) {
  check(`${character}: a careful player ${label} survives 3,000 ticks (2.5 min) on 8 seeds, with >=200 ms to time every move`, () => {
    const deaths = []
    const bot = makeBot(style)
    for (let seed = 1; seed <= 8; seed++) {
      const g = fresh(seed, character)
      press(g, 'enter')
      for (let i = 0; i < 3000 && g.mode === 'run'; i++) {
        bot.step(g)
        step(g, style)
        for (const o of g.obs) seen.add(o.kind)
      }
      if (g.mode !== 'run') deaths.push(`seed ${seed} at score ${g.score}, speed ${g.speed.toFixed(2)}\n${showPx(g)}`)
    }
    assert.equal(deaths.length, 0, `died:\n${deaths.join('\n\n')}`)
    const sorted = [...bot.windows].sort((a, b) => a - b)
    console.log(`     timing slack, ticks of 50 ms: min ${sorted[0]}, median ${sorted[sorted.length >> 1]} (${sorted.length} moves)`)
    assert.ok(sorted[0] >= 4, `some move had to be timed within ${sorted[0] * 50} ms`)
  })
}

check('every obstacle kind shows up', () => {
  for (const k of ['bug', 'bigbug', 'bugs', 'glitch', 'glitchHigh']) assert.ok(seen.has(k), `never saw ${k}`)
})

check('roar needs a full meter, then blasts the next obstacle for +50', () => {
  const g = fresh(9)
  press(g, 'enter')
  g.roar = 0.4
  press(g, 'roar')
  assert.equal(g.blast, null)
  g.roar = 1
  g.obs = [{ kind: 'bug', x: 50, h: 0 }]
  g.nextGap = 1e9
  press(g, 'roar')
  assert.ok(g.blast)
  for (let i = 0; i < 12; i++) tick(g, W)
  assert.equal(g.obs.length, 0)
  assert.equal(g.bonus, 50)
  assert.equal(g.mode, 'run')
})

check('Claude finishing pauses a running game with a banner; space resumes', () => {
  const g = fresh(2)
  setClaude(g, { state: 'working', seq: 1 })
  press(g, 'enter')
  for (let i = 0; i < 40; i++) tick(g, W)
  assert.match(hud(g, W).map(r => r.text).join(''), /Claude working 0:02/)
  setClaude(g, { state: 'done', seq: 2 })
  assert.equal(g.mode, 'paused')
  assert.match(showCells(g), /Claude is done!/)
  const d = g.dist
  tick(g, W)
  assert.equal(g.dist, d)
  press(g, 'jump')
  assert.equal(g.mode, 'run')
})

check('every row is exactly the pane width; runs keep every cell', () => {
  for (const w of [40, 55, 70, 120]) {
    const g = fresh(4)
    press(g, 'enter')
    for (let i = 0; i < 400 && g.mode === 'run'; i++) tick(g, w)
    const field = cells(g, w)
    assert.equal(field.length, ROWS)
    for (const row of field) {
      assert.equal(row.length, w)
      assert.equal(runs(row).map(r => r.text).join(''), row.map(c => c.ch).join(''))
      assert.ok(runs(row).length < 60, 'too many runs in a row')
    }
    assert.ok(hud(g, w).map(r => r.text).join('').length <= w)
  }
})

const fieldText = (g, w = W) => cells(g, w).map(r => r.map(c => c.ch).join('')).join('\n')

check('the cabinet opens on the arcade: insert coin, three games, two coming soon', () => {
  const g = newGame(1)
  assert.equal(g.screen, 'arcade')
  assert.match(hud(g, W).map(r => r.text).join(''), /INSERT COIN/)
  assert.match(fieldText(g), /CLICK TO INSERT COIN/)
  for (const game of GAMES) assert.ok(fieldText(g).includes(game.name), `missing ${game.name}`)
  assert.equal(fieldText(g).match(/COMING SOON/g)?.length, 2)
})

check('arrows move between cabinets; a coming-soon game says so and stays put', () => {
  const g = newGame(1)
  key(g, 'right')
  assert.equal(g.menu, 1)
  key(g, ' ')
  assert.equal(g.screen, 'arcade')
  assert.match(fieldText(g), /BUG BLASTER: COMING SOON/)
  for (let i = 0; i < 41; i++) tick(g, W)
  assert.doesNotMatch(fieldText(g), /STAY TUNED/)
  key(g, ' ') // BUG BLASTER: COMING SOON…
  key(g, 'left') // …then straight back to Dino Roar: the message must not now name Dino Roar
  assert.doesNotMatch(fieldText(g), /COMING SOON, STAY TUNED/)
  key(g, 'right')
  key(g, 'right')
  key(g, 'right')
  assert.equal(g.menu, 0) // wraps around
  assert.match(fieldText(g), /▶ DINO ROAR/)
})

check('Dino Roar leads to the runner select; pick Clawd, play as Clawd, back out with M', () => {
  const g = newGame(1)
  key(g, 'return')
  assert.equal(g.screen, 'select')
  assert.match(fieldText(g), /▶ DINO ◀/)
  assert.match(fieldText(g), /R: SPARK/)
  key(g, 'right')
  assert.match(fieldText(g), /▶ CLAWD ◀/)
  key(g, ' ')
  assert.equal(g.screen, 'game')
  assert.equal(g.character, 'clawd')
  assert.match(fieldText(g), /r spark/)
  assert.match(hud(g, W).map(r => r.text).join(''), /SPARK/)
  key(g, ' ') // start
  assert.equal(g.mode, 'run')
  for (let i = 0; i < 200; i++) tick(g, W)
  const score = g.score
  key(g, 'm') // works mid-run
  assert.equal(g.screen, 'select')
  assert.ok(g.best >= score, 'a quit run still counts toward the best')
  key(g, 'q')
  assert.equal(g.screen, 'arcade')
})

check('clicks: the first inserts the coin, then a click on a cabinet or portrait picks it', () => {
  const g = newGame(1)
  click(g, 10, 6, W)
  assert.equal(g.hasKeys, true)
  assert.equal(g.screen, 'arcade')
  click(g, W - 10, 6, W) // third cabinet: coming soon
  assert.equal(g.menu, 2)
  assert.equal(g.screen, 'arcade')
  click(g, 10, 6, W) // Dino Roar
  assert.equal(g.screen, 'select')
  click(g, W - 12, 6, W) // straight away: the second half of a double-click, ignored
  assert.equal(g.screen, 'select')
  wait(g)
  click(g, W - 12, 6, W) // right portrait: Clawd
  assert.equal(g.screen, 'game')
  assert.equal(g.character, 'clawd')
})

check('a remembered runner is the one preselected', () => {
  const g = newGame(1, 0, undefined, 'clawd')
  key(g, ' ')
  key(g, ' ')
  assert.equal(g.character, 'clawd')
})

check('every screen fills the pane exactly, at every width', () => {
  const screens = [g => g, g => (key(g, ' '), g), g => (key(g, ' '), key(g, ' '), g)]
  for (const w of [40, 55, 70, 120])
    for (const to of screens) {
      const g = to(newGame(1))
      for (let i = 0; i < 9; i++) tick(g, w)
      const field = cells(g, w)
      assert.equal(field.length, ROWS)
      for (const row of field) {
        assert.equal(row.length, w, `${g.screen} at ${w}`)
        assert.equal(runs(row).map(r => r.text).join(''), row.map(c => c.ch).join(''))
      }
      assert.ok(hud(g, w).map(r => [...r.text].length).reduce((a, b) => a + b, 0) <= w)
    }
})

check('◀ MENU / ◀ BACK in the HUD: click them to leave a run or the select', () => {
  const g = newGame(1)
  key(g, ' ')
  assert.match(hud(g, W).map(r => r.text).join(''), /^◀ BACK/)
  key(g, ' ')
  key(g, ' ') // running
  assert.match(hud(g, W).map(r => r.text).join(''), /^◀ MENU/)
  wait(g)
  click(g, 30, -1, W) // elsewhere on the HUD: just a jump
  assert.equal(g.screen, 'game')
  click(g, 2, -1, W)
  assert.equal(g.screen, 'select')
  wait(g)
  click(g, 2, -1, W)
  assert.equal(g.screen, 'arcade')
  for (const k of ['backspace', 'delete', 'b', 'm', 'q']) {
    const h = fresh(1)
    press(h, 'enter')
    key(h, k)
    assert.equal(h.screen, 'select', k)
  }
})

check('the special move never changes the hitbox: R while ducking under a glitch, or mid-jump, is safe', () => {
  for (const character of ['dino', 'clawd']) {
    for (let at = 3; at <= 20; at++) {
      const g = fresh(3, character)
      press(g, 'enter')
      g.nextGap = 1e9
      g.roar = 1
      g.obs = [{ kind: 'glitch', x: 30, h: 8 }]
      for (let i = 0; i < 60 && g.mode === 'run'; i++) {
        press(g, 'duck')
        if (g.obs[0] && g.obs[0].x <= at && g.roar >= 1) press(g, 'roar')
        tick(g, W)
      }
      assert.equal(g.mode, 'run', `${character} died roaring under a glitch at x<=${at}`)
    }
  }
})

check('a stale "Claude is done" banner turns into a plain pause when Claude works again', () => {
  const g = fresh(2)
  setClaude(g, { state: 'working', seq: 1 })
  press(g, 'enter')
  tick(g, W)
  setClaude(g, { state: 'done', seq: 2 })
  assert.equal(g.banner, 'claude-done')
  setClaude(g, { state: 'working', seq: 3 })
  assert.equal(g.mode, 'paused')
  assert.equal(g.banner, 'paused')
  assert.doesNotMatch(fieldText(g), /Claude is done/)
})

check('a jump right after dying keeps the score screen up for 600 ms', () => {
  const g = fresh(11)
  press(g, 'enter')
  let i = 0
  while (g.mode === 'run' && i++ < 3000) tick(g, W)
  assert.equal(g.mode, 'over')
  press(g, 'jump') // the late jump that killed you
  assert.equal(g.mode, 'over')
  wait(g, 12)
  press(g, 'jump')
  assert.equal(g.mode, 'run')
})

check('odd input does not throw: missing keys, narrow panes', () => {
  const g = newGame(1)
  key(g, undefined)
  key(g, '')
  key(g, '\u0000')
  const narrow = fieldText(g, 40)
  assert.match(narrow, /BUG BLAST/)
  assert.doesNotMatch(narrow, /BUG BLASTE\b/)
})

if (process.argv.includes('--look')) {
  for (const to of [g => g, g => (key(g, ' '), key(g, 'right'), g), g => (key(g, ' '), key(g, ' '), g)]) {
    const g = to(newGame(1))
    g.hasKeys = true
    console.log('\n' + hud(g, W).map(r => r.text).join('') + '\n' + fieldText(g))
  }
  const g = fresh(6)
  console.log('\n--- ready (cells) ---\n' + showCells(g))
  press(g, 'enter')
  const bot = makeBot()
  for (let i = 0; i < 700; i++) {
    bot.step(g)
    tick(g, W)
  }
  console.log('--- mid-run (cells) ---\n' + hud(g, W).map(r => r.text).join('') + '\n' + showCells(g))
}

if (failures) {
  console.log(`\n${failures} failing`)
  process.exit(1)
}
console.log('\nall passing')
