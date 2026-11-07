export type ClaudeStatus = { state: 'idle' | 'working' | 'done'; seq: number }
export type CharId = 'dino' | 'clawd'

declare module 'claude-code' {
  interface PluginState {
    'cl-arcade': { status: Shaped<ClaudeStatus>; best: Shaped<number>; character: Shaped<CharId> }
  }
}
