import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CharId, ClaudeStatus } from '../types'

const PANE = 'cl-arcade'
const TITLE = 'CL Arcade'
const ROWS = 15 // the HUD and the 14-row field
const SCREEN_BG = '#15110e' // same as SCREEN_BG in game.ts: the cabinet stays dark on light terminal themes
const AUTO_KEY = 'autoOpen'
const BEST_KEY = 'best'
const CHARACTER_KEY = 'character'
const MAX_SCORE = 9_999_999 // five-digit HUD with room to spare; anything above is not a real run

// Change a tag when its value's shape changes: it declines what an older version stored.
const status = atom({ plugin: 'cl-arcade', key: 'status' } as const, { state: 'idle', seq: 0 } as ClaudeStatus, {
  shape: 'status-1',
})
const best = atom({ plugin: 'cl-arcade', key: 'best' } as const, 0, { shape: 'best-1' })
const character = atom({ plugin: 'cl-arcade', key: 'character' } as const, 'dino' as CharId, { shape: 'character-1' })

const isCharId = (v: unknown): v is CharId => v === 'dino' || v === 'clawd'
const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= MAX_SCORE

// Read once per load (session.start) and kept in step by `/arcade auto`, so a turn never waits on the store.
let isAutoOpen = false

const HELP = 'CL Arcade: /arcade opens it (click it to insert a coin, Esc gives the keys back) · /arcade auto opens it whenever Claude starts working · /arcade close closes it'

// /arcade. Top level: the engine only lets `$` flow into functions declared at the top of the file.
// Answers go to a toast, not the transcript: a plugin command's text would be sent to the model too.
async function runCommand($: EngineInterface, args: string) {
  const arg = args.trim().toLowerCase()

  if (arg === 'help') {
    $.ui.toast(HELP)
    return {}
  }
  if (arg === 'close') {
    await $.ui.close({ id: PANE })
    return {}
  }
  if (arg === 'auto') {
    isAutoOpen = !isAutoOpen
    await $.store.set(AUTO_KEY, isAutoOpen)
    $.ui.toast(
      isAutoOpen ? 'CL Arcade will open whenever Claude starts working.' : 'CL Arcade will only open with /arcade.',
    )
    return {}
  }

  const opened = await $.ui.open({ id: PANE, title: TITLE, rows: ROWS, backgroundColor: SCREEN_BG })
  $.ui.toast(
    opened.isPlaced
      ? 'CL Arcade: click the cabinet to insert a coin. Esc gives the keys back to the prompt.'
      : `CL Arcade could not open yet: ${opened.reason}`,
  )
  return {}
}

export const register: Register = on => {
  let seed = 1

  on('session.start', async ($, e, next) => {
    // Literal names: the engine reads them off the source.
    await $.command.register({
      name: 'arcade',
      description: 'Open CL Arcade (unofficial): play pixel games while Claude works',
      argumentHint: '[auto|close|help]',
      immediate: true, // open it while Claude is working, which is the point
    })
    const stored = await $.store.get(BEST_KEY)
    if (isScore(stored) && stored > 0) await update($, best, b => Math.max(b, stored))
    const runner = await $.store.get(CHARACTER_KEY)
    if (isCharId(runner)) await update($, character, () => runner)
    isAutoOpen = (await $.store.get(AUTO_KEY)) === true
    seed = Math.floor((await $.clock.now()) % 2147483647) || 1

    return next(e)
  })

  on('command.run', { command: 'arcade' }, ($, e) => runCommand($, e.args))

  // Claude's state, main loop only: subagents start and finish turns too.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await update($, status, s => ({ state: 'working' as const, seq: s.seq + 1 }))
    // A `ui.open` hook may refuse; that's fine, and must not surface as an error on the turn.
    if (isAutoOpen) $.ui.open({ id: PANE, title: TITLE, rows: ROWS, backgroundColor: SCREEN_BG }).catch(() => {})
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) await update($, status, s => ({ state: 'done' as const, seq: s.seq + 1 }))
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>CL Arcade plays in the terminal or the desktop app.</Text>
    }
    const { Client } = $.ui.resolve(e)
    const claude = await read($, status)
    const top = await read($, best)
    const runner = await read($, character)

    return (
      <Client
        key="game"
        module="./game.ts"
        props={{ claude, best: top, seed, character: runner }}
        width="100%"
        height={ROWS}
      />
    )
  })

  // The cabinet posts { best, character } when a run beats the record or a new runner is picked.
  // Posted data is input to validate, not a fact: only whole scores in range, only known runners.
  on('ui.message', { element: 'game' }, async ($, e, next) => {
    const data = (e.data ?? {}) as { best?: unknown; character?: unknown }
    if (isScore(data.best)) {
      const score = data.best
      // The store is shared by every open session: merge with what's there, never lower it.
      const stored = await $.store.get(BEST_KEY)
      const top = Math.max(score, isScore(stored) ? stored : 0)
      if (!isScore(stored) || top > stored) await $.store.set(BEST_KEY, top)
      await update($, best, b => Math.max(b, top))
    }
    if (isCharId(data.character) && data.character !== (await read($, character))) {
      const picked = data.character
      await update($, character, () => picked)
      await $.store.set(CHARACTER_KEY, picked)
    }
    return next(e)
  })
}
