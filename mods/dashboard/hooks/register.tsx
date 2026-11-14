import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Antwort, Todo } from '../types'

// Mod 3: Dashboard neben dem Chat.
// Zwei Listen: meine To-dos und Nachrichten, die ich noch beantworten muss.
// Beide bleiben über Sitzungen hinweg erhalten ($.store). Claudes eigene
// Aufgabenlisten (TodoWrite / TaskCreate) erscheinen automatisch mit.

const PANE = 'dashboard'

const todos = atom({ plugin: 'dashboard', key: 'todos' } as const, [], { shape: 'todos-1' })
const antworten = atom({ plugin: 'dashboard', key: 'antworten' } as const, [], {
  shape: 'antworten-1',
})
const erledigteZeigen = atom({ plugin: 'dashboard', key: 'erledigteZeigen' } as const, false, {
  shape: 'zeigen-1',
})

const neueId = () => crypto.randomUUID().slice(0, 8)

async function todosAendern($: EngineInterface, fn: (l: readonly Todo[]) => Todo[]) {
  await update($, todos, l => fn(l).slice(-200))
  await $.store.set('todos', await read($, todos))
}

async function antwortenAendern($: EngineInterface, fn: (l: readonly Antwort[]) => Antwort[]) {
  await update($, antworten, l => fn(l).slice(-200))
  await $.store.set('antworten', await read($, antworten))
}

/** "Anna: Angebot zurückschicken" -> von Anna, worum Angebot … */
function parseAntwort(text: string): Antwort | undefined {
  const t = text.trim()
  if (t === '') return undefined
  const i = t.indexOf(':')
  const von = i > 0 ? t.slice(0, i).trim() : t
  const worum = i > 0 ? t.slice(i + 1).trim() : ''

  return { id: neueId(), von, worum, done: false }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const t = await $.store.get('todos')
    const a = await $.store.get('antworten')
    if (Array.isArray(t)) await update($, todos, () => t as Todo[])
    if (Array.isArray(a)) await update($, antworten, () => a as Antwort[])

    await $.command.register({ name: 'dashboard', description: 'Dashboard mit To-dos und offenen Antworten öffnen' })
    await $.command.register({ name: 'todo', description: 'To-do zum Dashboard hinzufügen', argumentHint: '<text>' })
    await $.command.register({
      name: 'antworten',
      description: 'Nachricht merken, die du noch beantworten musst',
      argumentHint: '<wer>: <worum es geht>',
    })
    void $.ui.open({ id: PANE, title: 'Dashboard' })

    return next(e)
  })

  on('command.run', { command: 'dashboard' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Dashboard', focus: true })

    return { text: 'Dashboard geöffnet.', isTextDisplayOnly: true }
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    const text = e.args.trim()
    if (text === '') return { text: 'Benutzung: /todo <text>', isTextDisplayOnly: true }
    await todosAendern($, l => [...l, { id: neueId(), text, done: false, quelle: 'ich' }])

    return { text: `To-do hinzugefügt: ${text}`, isTextDisplayOnly: true }
  })

  on('command.run', { command: 'antworten' }, async ($, e) => {
    const neu = parseAntwort(e.args)
    if (neu === undefined) return { text: 'Benutzung: /antworten <wer>: <worum es geht>', isTextDisplayOnly: true }
    await antwortenAendern($, l => [...l, neu])

    return { text: `Gemerkt: ${neu.von} wartet auf Antwort.`, isTextDisplayOnly: true }
  })

  // Claudes Aufgabenliste spiegeln.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      const vonClaude: Todo[] = e.todos.map((t, i) => ({
        id: `claude-todo-${i}`,
        text: t.content,
        done: t.status === 'completed',
        quelle: 'claude',
      }))
      await todosAendern($, l => [...l.filter(x => !x.id.startsWith('claude-todo-')), ...vonClaude])
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await todosAendern($, l => [...l, { id: neueId(), text: e.subject, done: false, quelle: 'claude' }])
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    const subject = e.subject
    if (ran.deny === undefined && ran.isError !== true && e.status === 'completed' && subject !== undefined) {
      await todosAendern($, l => l.map(x => (x.quelle === 'claude' && x.text === subject ? { ...x, done: true } : x)))
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const alleTodos = await read($, todos)
    const alleAntworten = await read($, antworten)
    const zeigen = await read($, erledigteZeigen)
    const offeneTodos = alleTodos.filter(t => !t.done).length
    const offeneAntworten = alleAntworten.filter(a => !a.done).length

    // Minimiertes Widget: nur die Zahlen.
    if (e.props.placement === 'widget') {
      return (
        <Text>
          ☐ {offeneTodos} To-dos · ✉ {offeneAntworten} offen
        </Text>
      )
    }

    const sichtbareTodos = alleTodos.filter(t => zeigen || !t.done)
    const sichtbareAntworten = alleAntworten.filter(a => zeigen || !a.done)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>☐ To-dos ({offeneTodos} offen)</Text>
          {sichtbareTodos.length === 0 && <Text dimColor>Nichts zu tun. /todo &lt;text&gt; fügt eins hinzu.</Text>}
          {sichtbareTodos.map(t => (
            <Box flexDirection="row" gap={1}>
              <Button
                key={`todo-${t.id}`}
                label={t.done ? '☑' : '☐'}
                plain
                onPress={() => todosAendern($, l => l.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)))}
              />
              <Text dimColor={t.done} strikethrough={t.done}>
                {t.text}
                {t.quelle === 'claude' ? ' (Claude)' : ''}
              </Text>
            </Box>
          ))}
          <Input
            key="todo-neu"
            placeholder="Neues To-do …"
            submitLabel="hinzufügen"
            onSubmit={value => {
              const text = value.trim()
              if (text !== '') void todosAendern($, l => [...l, { id: neueId(), text, done: false, quelle: 'ich' }])
            }}
          />
        </Box>

        <Box flexDirection="column">
          <Text bold>✉ Noch zu beantworten ({offeneAntworten})</Text>
          {sichtbareAntworten.length === 0 && <Text dimColor>Alle Nachrichten beantwortet.</Text>}
          {sichtbareAntworten.map(a => (
            <Box flexDirection="row" gap={1}>
              <Button
                key={`antwort-${a.id}`}
                label={a.done ? '☑' : '☐'}
                plain
                onPress={() => antwortenAendern($, l => l.map(x => (x.id === a.id ? { ...x, done: !x.done } : x)))}
              />
              <Text dimColor={a.done} strikethrough={a.done}>
                <Text bold>{a.von}</Text>
                {a.worum ? ` – ${a.worum}` : ''}
              </Text>
            </Box>
          ))}
          <Input
            key="antwort-neu"
            placeholder="Wer: worum es geht …"
            submitLabel="merken"
            onSubmit={value => {
              const neu = parseAntwort(value)
              if (neu !== undefined) void antwortenAendern($, l => [...l, neu])
            }}
          />
        </Box>

        <Box flexDirection="row" gap={2}>
          <Button
            key="toggle-erledigt"
            label={zeigen ? 'Erledigte ausblenden' : 'Erledigte zeigen'}
            onPress={() => update($, erledigteZeigen, v => !v)}
          />
          <Button
            key="aufraeumen"
            label="Erledigte löschen"
            onPress={async () => {
              await todosAendern($, l => l.filter(x => !x.done))
              await antwortenAendern($, l => l.filter(x => !x.done))
            }}
          />
        </Box>
      </Box>
    )
  })
}
