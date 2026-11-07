# CL Arcade

**claude's thinking. you're playing.** (cl: Claude, or command line. Both are true.)

*Unofficial fan project: not made by or affiliated with Anthropic.*

A pixel arcade that lives in a pane beside your [Claude Code](https://claude.com/claude-code) chat. Play while Claude works; your run pauses when Claude finishes its turn.

**Site and live demo:** https://thebliz.github.io/cl-arcade/  
**Trailer (21 s, sound on):** [docs/media/cl-arcade.mp4](docs/media/cl-arcade.mp4)

```
 ╔═══════════════════╗  ╭───────────────────╮  ╭───────────────────╮
 ║          ▄█▀█     ║  │       ▀▄▄▄▄▀      │  │         ██        │
 ║     ▀▄▀▄██▀       ║  │      ▄███████     │  │        ████       │
 ║      █▀▀█         ║  │      ▀█▀█▀█▀█     │  │       ██████      │
 ║    ▶ DINO ROAR    ║  │    BUG BLASTER    │  │    TOKEN TOWER    │
 ║ run · jump · roar ║  │    COMING SOON    │  │    COMING SOON    │
 ╚═══════════════════╝  ╰───────────────────╯  ╰───────────────────╯
```

## Install

Needs Claude Code 2.1.275 or later. At the prompt of a Claude Code session in your terminal:

```
/plugin install cl-arcade --marketplace theBliz/cl-arcade
```

Answer `y` to add the marketplace, then press Enter to install for your user. That's it: no extra account, no config.

From a shell instead:

```
claude plugin install cl-arcade --marketplace theBliz/cl-arcade
```

In the Claude Code desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `theBliz/cl-arcade`, then **Add plugin**.

## Update

```
claude plugin update cl-arcade
```

Then run `/reload-plugins` in an open session, or start a new one.

## Play

Type `/arcade`. The cabinet opens beside the chat.

1. **Click it to insert a coin.** Claude Code only hands a pane the keyboard after a click.
2. Pick a game. **Dino Roar** is live: an endless runner inspired by the dinosaur game on Google Chrome's offline page (not affiliated with Google). Bug Blaster and Token Tower are coming soon.
3. Pick a runner: **Dino** (special: ROAR) or **Clawd** (special: SPARK).

| Key | Does |
| --- | --- |
| Space / ↑ | jump (and start, and restart) |
| ↓ | duck; in the air, drop fast |
| → / ← | boost up to +50% (more points) / brake down to -25% |
| R | your runner's special: blasts the next obstacle once the meter is full |
| P | pause |
| M | back to the runner select, then the arcade |
| Esc | give the keyboard back to the prompt (press P first: the game can't see Esc, so a run carries on) |

The top bar shows how long Claude has been working. When Claude finishes its turn, a running game pauses with a banner. A permission prompt in the middle of a turn doesn't pause it yet.

| Command | Does |
| --- | --- |
| `/arcade` | open the cabinet |
| `/arcade auto` | toggle opening it whenever Claude starts working |
| `/arcade close` | close it |

## Where it runs

Claude Code 2.1.275 or later, in a terminal. Tested on macOS; other terminals and the Claude Code desktop app should work too. Editor extensions and the mobile app can't host the live game, so the pane says so there.

## Uninstall

```
/plugin uninstall cl-arcade
/plugin marketplace remove cl-arcade
```

Your best score, runner and auto-open setting sit in a small file under `~/.claude/plugins/store/`. Delete it for a clean slate.

## How it's built

A Claude Code plugin made of one hooks module and one surface module, no dependencies:

- `hooks/register.tsx` registers `/arcade`, opens the pane, listens for Claude starting and finishing a turn, and keeps your best score.
- `hooks/game.ts` is the whole arcade: menus, Dino Roar, the runners, and a half-block pixel renderer (each terminal cell is two pixels). Its engine is pure functions, so it also runs in Node and in the browser.
- `tests/game.test.mjs` (`node tests/game.test.mjs`) includes a bot that plays thousands of ticks with both runners, cruising, boosting and braking, to check every obstacle can be cleared with at least 200 ms to spare.
- `docs/` is the GitHub Pages site. `node scripts/build-site.mjs` rebuilds `docs/game.js` from `hooks/game.ts`, so the live demo runs the same engine.

Releasing: bump `version` in `.claude-plugin/plugin.json` for every release. Installed copies stay on the version they have until it changes.

Ideas and new games welcome: open an issue or a pull request.

## License and trademarks

[MIT](LICENSE) © theBliz. The licence covers this repo's code and original art only. The Geist fonts in `docs/fonts/` are under the SIL Open Font License ([docs/fonts/OFL.txt](docs/fonts/OFL.txt)).

Unofficial fan project, not affiliated with or endorsed by Anthropic or Google. Claude and Claude Code are trademarks of Anthropic, and Clawd, Claude Code's mascot, appears here as fan art; Chrome is a trademark of Google LLC. No rights in those marks or characters are granted.
