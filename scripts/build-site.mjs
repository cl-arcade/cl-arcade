// Builds docs/game.js (the landing page's live demo) from hooks/game.ts, the same engine the plugin runs.
// Node 22.13+ strips the TypeScript types itself: `node scripts/build-site.mjs`.
import { readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const src = readFileSync(new URL('../hooks/game.ts', import.meta.url), 'utf8')
const js = stripTypeScriptTypes(src, { mode: 'strip' })
writeFileSync(new URL('../docs/game.js', import.meta.url), `// Generated from hooks/game.ts by scripts/build-site.mjs. Do not edit.\n${js}`)
console.log('docs/game.js written')
