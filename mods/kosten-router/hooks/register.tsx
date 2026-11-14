import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Modus, RouterStats, Stufe } from '../types'

// Mod 2: Kosten sparen.
// Jede neue Aufgabe im Haupt-Chat wird eingestuft (einfach / mittel / schwer)
// und alle Modell-Anfragen dieser Runde gehen an das passende Modell:
//   einfach -> haiku, mittel -> sonnet, schwer -> opus.
// Läuft eine Haiku-Runde lange (viele Werkzeugschritte), wird auf Sonnet
// hochgestuft. Mit /modell lässt sich das Routing festnageln oder abschalten.

const MODELL: Record<Stufe, 'haiku' | 'sonnet' | 'opus'> = {
  einfach: 'haiku',
  mittel: 'sonnet',
  schwer: 'opus',
}

// Ab so vielen Schritten in einer Runde ist die Aufgabe offenbar nicht einfach.
const HOCHSTUFEN_AB_SCHRITT = 8

const SCHWER =
  /architekt|refactor|refaktor|debug|race.?condition|deadlock|sicherheit|security|vulnerab|algorithm|beweis|optimier|migration|migrier|komplex|kompliziert|performance|nebenläufig|concurren|design.?doc|systemdesign|tiefgehend|gründlich|ultrathink|warum .*(fehl|kaputt|crash)/i
const EINFACH =
  /^(hi|hallo|danke|ok|ja|nein|was (ist|heißt|bedeutet)|übersetze|formatier|tippfehler|typo|umbenennen|rename|zeig|liste|wie spät|kurz)/i

const stats = atom(
  { plugin: 'kosten-router', key: 'stats' } as const,
  { haiku: 0, sonnet: 0, opus: 0, andere: 0 },
  { shape: 'stats-1' },
)
const modus = atom({ plugin: 'kosten-router', key: 'modus' } as const, 'auto', {
  shape: 'modus-1',
})

/** Schnelle Heuristik; undefined heißt: unklar, das kleine Modell fragen. */
function heuristik(text: string): Stufe | undefined {
  const t = text.trim()
  if (t.length === 0) return undefined
  if (SCHWER.test(t)) return 'schwer'
  if (t.length > 1500 || (t.match(/```/g)?.length ?? 0) >= 4) return 'schwer'
  if (EINFACH.test(t) && t.length < 200) return 'einfach'
  if (t.length < 60) return 'einfach'

  return undefined
}

async function einstufen($: EngineInterface, text: string): Promise<Stufe> {
  const schnell = heuristik(text)
  if (schnell !== undefined) return schnell
  try {
    const label = await $.model.classify(
      'Stufe ein, wie schwer diese Aufgabe für einen KI-Coding-Assistenten ist. ' +
        'einfach = Smalltalk, kurze Fakten, kleine mechanische Änderung. ' +
        'mittel = normale Programmier- oder Schreibaufgabe. ' +
        'schwer = Architektur, schwieriges Debugging, mehrstufiges Denken, großer Umbau.\n\n' +
        `Aufgabe:\n${text.slice(0, 4000)}`,
      ['einfach', 'mittel', 'schwer'],
      { model: 'haiku' },
    )
    if (label === 'einfach' || label === 'mittel' || label === 'schwer') return label
  } catch {
    // Einstufung fehlgeschlagen: sicherer Mittelweg
  }

  return 'mittel'
}

function zaehle(s: RouterStats, model: string): RouterStats {
  const m = model.toLowerCase()
  const key = m.includes('haiku') ? 'haiku' : m.includes('sonnet') ? 'sonnet' : m.includes('opus') ? 'opus' : 'andere'

  return { ...s, [key]: s[key] + 1 }
}

function statusZeigen($: EngineInterface, stufe: Stufe, model: string) {
  $.ui.status(`💸 ${model} · ${stufe}`)
}

export const register: Register = on => {
  // turnId -> Stufe der Runde (nur Haupt-Chat)
  const runden = new Map<string, Stufe>()
  let letzteStufe: Stufe = 'mittel'

  on('session.start', async ($, e, next) => {
    const gespeichert = await $.store.get('modus')
    if (gespeichert === 'auto' || gespeichert === 'haiku' || gespeichert === 'sonnet' || gespeichert === 'opus') {
      await update($, modus, () => gespeichert)
    }
    await $.command.register({
      name: 'modell',
      description: 'Kosten-Router: auto | haiku | sonnet | opus – ohne Argument: Statistik',
      argumentHint: '[auto|haiku|sonnet|opus]',
    })

    return next(e)
  })

  on('command.run', { command: 'modell' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'auto' || arg === 'haiku' || arg === 'sonnet' || arg === 'opus') {
      await update($, modus, () => arg)
      await $.store.set('modus', arg)

      return {
        text:
          arg === 'auto'
            ? 'Kosten-Router: automatisch (einfach → Haiku, mittel → Sonnet, schwer → Opus).'
            : `Kosten-Router: fest auf ${arg}, bis du /modell auto eingibst.`,
      }
    }
    if (arg !== '') {
      return { text: 'Unbekannt. Erlaubt: /modell auto | haiku | sonnet | opus' }
    }
    const s = await read($, stats)
    const gesamt = s.haiku + s.sonnet + s.opus + s.andere
    const anteil = (n: number) => (gesamt === 0 ? '0 %' : `${Math.round((n / gesamt) * 100)} %`)

    return {
      text: [
        `Kosten-Router · Modus: ${await read($, modus)}`,
        `Modell-Anfragen dieser Sitzung: ${gesamt}`,
        `  Haiku  ${s.haiku} (${anteil(s.haiku)})`,
        `  Sonnet ${s.sonnet} (${anteil(s.sonnet)})`,
        `  Opus   ${s.opus} (${anteil(s.opus)})`,
        ...(s.andere ? [`  andere ${s.andere}`] : []),
      ].join('\n'),
      isTextDisplayOnly: true,
    }
  })

  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result // Subagenten haben ihr eigenes Modell

    const m: Modus = await read($, modus)
    let stufe: Stufe
    if (m !== 'auto') {
      stufe = m === 'haiku' ? 'einfach' : m === 'sonnet' ? 'mittel' : 'schwer'
    } else if (e.text.trim() === '') {
      stufe = letzteStufe // Fortsetzung: Stufe beibehalten
    } else {
      stufe = await einstufen($, e.text)
    }
    letzteStufe = stufe
    runden.set(e.turnId, stufe)
    if (runden.size > 50) runden.delete(runden.keys().next().value as string)
    statusZeigen($, stufe, MODELL[stufe])

    return result
  })

  // Jede Modell-Anfrage der Runde: Modell umschreiben.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      await update($, stats, s => zaehle(s, e.model))
      return yield* next(e)
    }
    let stufe = runden.get(e.turnId)
    if (stufe === 'einfach' && e.index >= HOCHSTUFEN_AB_SCHRITT) {
      stufe = 'mittel'
      runden.set(e.turnId, stufe)
      $.ui.toast('Aufgabe ist doch umfangreicher – wechsle von Haiku auf Sonnet')
    }
    const model = stufe === undefined ? e.model : MODELL[stufe]
    if (stufe !== undefined) statusZeigen($, stufe, model)
    await update($, stats, s => zaehle(s, model))

    return yield* next(model === e.model ? e : { ...e, model })
  })

  // Allgemeine Subagenten ohne festes Modell ebenfalls günstig starten.
  on('agent.spawn', async ($, e, next) => {
    const allgemein = e.subagentType === 'general-purpose' || e.subagentType === 'Explore'
    if (!allgemein || e.model !== undefined || (await read($, modus)) !== 'auto') return next(e)
    const stufe = await einstufen($, e.prompt)

    return next({ ...e, model: MODELL[stufe] })
  }).catch(($, e, next) => next(e))
}
