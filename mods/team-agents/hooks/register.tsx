import type { EngineInterface, Register } from 'claude-code'

// Mod 1: Chats arbeiten zusammen.
// Der Haupt-Chat ist der Chef (siehe commands/team.md): er zerlegt die Aufgabe
// und schickt Teilaufgaben an zwei Spezialisten, die dieser Mod als
// Agent-Typen anmeldet.

const RECHERCHE_PROMPT = `Du bist der Recherche-Agent in einem Team. Ein Chef-Agent gibt dir eine Rechercheaufgabe.

Vorgehen:
- Sammle Fakten aus dem Code (Read, Grep, Glob) und, wenn nötig, aus dem Web (WebSearch, WebFetch).
- Ändere keine Dateien.
- Arbeite gründlich, aber fokussiert auf die gestellte Frage.

Antwortformat (auf Deutsch, knapp):
## Ergebnis
Die wichtigsten Erkenntnisse als Stichpunkte.
## Belege
Dateipfade mit Zeilennummern bzw. URLs.
## Offene Punkte
Was du nicht klären konntest.`

const ENTWURF_PROMPT = `Du bist der Entwurfs-Agent in einem Team. Ein Chef-Agent gibt dir eine Aufgabe und die Rechercheergebnisse.

Vorgehen:
- Erstelle den verlangten Entwurf: Text, Konzept oder Code.
- Stütze dich auf die mitgelieferte Recherche; erfinde keine Fakten.
- Schreibe Dateien nur, wenn der Chef das ausdrücklich verlangt; sonst liefere den Entwurf in deiner Antwort.

Antwortformat (auf Deutsch):
## Entwurf
Der vollständige Entwurf.
## Annahmen
Was du angenommen hast und der Chef prüfen sollte.`

const LABEL: Record<string, string> = {
  'team-agents:recherche': 'Recherche',
  'team-agents:entwurf': 'Entwurf',
}

function showStatus($: EngineInterface, running: Map<string, string>) {
  const roles = [...running.values()]
  $.ui.status(roles.length ? `Team: ${roles.join(' + ')} arbeitet …` : undefined)
}

export const register: Register = on => {
  // agentId -> Rolle, solange der Agent läuft (Modulvariable: ein Reload leert sie)
  const running = new Map<string, string>()

  on('session.start', async ($, e, next) => {
    await $.agent.register({
      name: 'recherche',
      description:
        'Recherche-Agent des Teams: sammelt Fakten aus Code und Web und liefert Ergebnisse mit Belegen. Ändert keine Dateien.',
      prompt: RECHERCHE_PROMPT,
      tools: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],
      model: 'sonnet',
      maxTurns: 40,
    })
    await $.agent.register({
      name: 'entwurf',
      description:
        'Entwurfs-Agent des Teams: schreibt aus Aufgabe und Rechercheergebnissen einen Entwurf (Text, Konzept oder Code).',
      prompt: ENTWURF_PROMPT,
      tools: ['Read', 'Grep', 'Glob', 'Write', 'Edit'],
      model: 'sonnet',
      maxTurns: 40,
    })

    return next(e)
  })

  // Zeigt in der Statuszeile, welcher Team-Agent gerade arbeitet.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const role = LABEL[e.subagentType]
    if (role !== undefined && 'agentId' in result && result.agentId) {
      running.set(result.agentId, role)
      showStatus($, running)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const id = e.agentId
    if (id !== undefined && running.has(id)) {
      const role = running.get(id)
      running.delete(id)
      $.ui.toast(`${role}-Agent ist fertig`)
      showStatus($, running)
    }

    return result
  })
}
