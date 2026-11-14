export type Stufe = 'einfach' | 'mittel' | 'schwer'
export type Modus = 'auto' | 'haiku' | 'sonnet' | 'opus'

/** Wie viele Modell-Anfragen in dieser Sitzung an welches Modell gingen. */
export type RouterStats = { haiku: number; sonnet: number; opus: number; andere: number }

declare module 'claude-code' {
  interface PluginState {
    'kosten-router': {
      stats: Shaped<RouterStats>
      modus: Shaped<Modus>
    }
  }
}
