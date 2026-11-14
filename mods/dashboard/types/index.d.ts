export type Todo = { id: string; text: string; done: boolean; quelle: 'ich' | 'claude' }
export type Antwort = { id: string; von: string; worum: string; done: boolean }

declare module 'claude-code' {
  interface PluginState {
    dashboard: {
      todos: Shaped<Todo[]>
      antworten: Shaped<Antwort[]>
      erledigteZeigen: Shaped<boolean>
    }
  }
}
