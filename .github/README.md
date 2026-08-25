# Werkora-App

**Deploy-Ziel für `app.werkora.ch`. Keine Quelle — hier wird nicht entwickelt.**

Der Anwendungscode im Wurzelverzeichnis wird aus
[`werkora-backend`](https://github.com/bazzi-beventures/werkora-backend)
gespiegelt (`bau-app/`, via `sync-bau-app.yml` bei jedem Push auf `main`).
Wer hier am Code editiert, verliert die Änderung beim nächsten Sync.

Nur `.github/` überlebt — dieser Ordner ist im rsync ausgenommen. Deshalb liegt
auch diese Datei hier und nicht im Wurzelverzeichnis.

## Warum es dieses Repo gibt

Eine GitHub-Pages-Site trägt **genau eine** Custom-Domain (die `CNAME`-Datei
hält einen einzigen Namen). [`Bau-App`](https://github.com/bazzi-beventures/Bau-App)
hält `app.beventures.ch`. Während des Domainwechsels müssen beide Adressen eine
Zeit lang gleichzeitig laufen, damit niemand von einem Tag auf den anderen
ausgesperrt wird — also braucht es ein zweites Ziel.

| Repo | Domain | Rolle |
|---|---|---|
| **Werkora-App** (hier) | `app.werkora.ch` | Build gegen `api.werkora.ch` |
| `Bau-App` | `app.beventures.ch` | alte API + Umzugs-Banner, wird abgeschaltet |
| `Bau-App-Staging` | `app-staging.beventures.ch` | Staging |

Nach der Abschaltung der alten Origin ist dieses Repo das alleinige
Produktionsziel.

Hintergrund und Ablauf:
[`docs/specs/werkora-domain-app-einstieg.md`](https://github.com/bazzi-beventures/werkora-backend/blob/develop/docs/specs/werkora-domain-app-einstieg.md), P3.

## Erforderliches Secret

| Secret | Wert |
|---|---|
| `VITE_API_URL` | `https://api.werkora.ch` |

Zeigt es auf `api.beventures.ch`, wird die API zum Drittanbieter: Safari blockt
den Session-Cookie dann auch bei `fetch`, und der Login ist auf jedem iPhone
tot. Das ist der Grund, warum App und API gemeinsam umziehen.
