# Drei Claude-Code-Mods

| Mod | Was er tut | Benutzung |
| --- | --- | --- |
| `team-agents` | Der Haupt-Chat wird zum **Chef-Agenten**: er plant, schickt Rechercheaufgaben an den Agenten `team-agents:recherche` (nur Lesen, Web) und den Entwurf an `team-agents:entwurf`, prüft das Ergebnis und fasst es zusammen. Beide Spezialisten laufen auf Sonnet. Die Statuszeile zeigt, wer gerade arbeitet. | `/team <aufgabe>` |
| `kosten-router` | Stuft jede neue Aufgabe ein (Heuristik, bei Unklarheit fragt Haiku) und lenkt alle Modell-Anfragen der Runde: **einfach → Haiku, mittel → Sonnet, schwer → Opus**. Läuft eine Haiku-Runde länger als 8 Schritte, wird auf Sonnet hochgestuft. Allgemeine Subagenten ohne festes Modell werden ebenso geroutet. | `/modell` (Statistik), `/modell auto\|haiku\|sonnet\|opus` |
| `dashboard` | Panel neben dem Chat mit **To-dos** und **Nachrichten, die du noch beantworten musst**. Abhaken per Klick, neue Einträge direkt im Panel. Claudes eigene Aufgabenlisten (TodoWrite/TaskCreate) erscheinen automatisch. Bleibt über Sitzungen erhalten. | `/dashboard`, `/todo <text>`, `/antworten <wer>: <worum>` |

## Installation

Jeden Ordner als Plugin-Verzeichnis laden, z. B.:

```bash
claude --plugin-dir mods/team-agents --plugin-dir mods/kosten-router --plugin-dir mods/dashboard
```

Prüfen: `claude plugin validate mods/<name>`.

## Hinweise

- Ein Modellwechsel zwischen Runden verwirft den Prompt-Cache dieser Runde; bei sehr kurzen Wechseln kann das einen Teil der Ersparnis auffressen.
- Die Nachrichtenliste im Dashboard wird von Hand gepflegt; eine Anbindung an Gmail/Slack über einen Connector ist ein möglicher nächster Schritt.
