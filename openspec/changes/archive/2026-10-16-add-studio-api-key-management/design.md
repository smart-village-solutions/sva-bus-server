# Abschluss des Bus-Vertrags und Übergabe an SVA Studio

## Status und Verantwortlichkeiten

Stand: 16. Oktober 2026. Bus-Implementierung abgeschlossen und als `0.7.3` veröffentlicht.
Dieser Archivdatensatz beschreibt nur die ausgelieferte Bus-Funktion. Die noch offene
Studio-Integration ist im [verknüpften Studio-Change](https://github.com/smart-village-solutions/sva-studio/tree/main/openspec/changes/add-bus-api-key-management)
mit Formular, Datenregeln, Autorisierung und gemeinsamer Abnahme fortgeführt.

`Browser mit Studio-Session → Studio-Server → Bus-Admin-Schnittstelle → Redis`

Die Bus-Key-Registry bleibt führend für Hashing, Gültigkeit und Lifecycle. Studio besitzt
künftig die menschliche Benutzerautorisierung. Der Bus prüft weiterhin seinen technischen
`ADMIN_API_TOKEN`; ein Actor-Header ersetzt weder diesen Token noch einen Login.
Es entsteht kein zusätzliches Instanz-ID-Feld und keine zweite Key-Registry.

## Veröffentlichter Vertrag

| Aufruf                                                       | Verhalten                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `GET /internal/api-keys?label=<instanceId>`                  | Getrimmten Label-Wert vollständig und case-sensitiv vergleichen; ohne Filter bisherige globale Liste |
| `POST /internal/api-keys/:keyId/revoke?label=<instanceId>`   | Vor Sperrung Zugehörigkeit des gespeicherten Keys prüfen                                             |
| `POST /internal/api-keys/:keyId/activate?label=<instanceId>` | Vor Reaktivierung dieselbe Zugehörigkeit prüfen; Ablaufzeitpunkt unverändert                         |
| Bestehende Aufrufe ohne neue Parameter                       | Bisheriges Admin-Verhalten bleibt kompatibel                                                         |

Ein leerer oder wiederholter Label-Filter ergibt 400; ein unbekannter Key oder falsches
Label bei einer Mutation 404 ohne Datensatzänderung. Metadatenlisten enthalten weder
Hash noch Klartext-Key. Neue Klartext-Keys werden weiterhin nur einmal bei Erstellung
ausgegeben. Labels ordnen Verwaltungsdaten zu und beschränken keine Bundeslandauswahl
im mobilen Proxy.

Der optionale Header `x-admin-actor-id` akzeptiert nach erfolgreicher Bearer-Prüfung
eine nicht leere, getrimmte ID mit höchstens 256 Zeichen ohne Steuerzeichen oder Komma.
Das Audit enthält sie als `studioActorId` neben der technischen `adminIdentity` und
Request-ID. Die Angabe ist eine Assertion des authentifizierten technischen Aufrufers.
Initialen in `createdBy` bleiben getrennte Metadaten. Key-Klartext, Hash, Admin-Token
und Kunden-Kontakt-E-Mail werden nicht in Auditdetails aufgenommen.

Admin-Antworten im Guard-/Controller-Pfad tragen `Cache-Control: no-store`; der Proxy
entfernt den Actor-Header vor Upstream-Aufrufen. Die Implementierung erweitert nur
bestehende Guards, Controller und Services.

## Prüf- und Veröffentlichungsnachweis

- Lokale Prüfung: 137 Unit-Tests und 48 E2E-Tests erfolgreich, ebenso Lint, Build,
  Formatprüfung und strikte OpenSpec-Validierung. Jest lief mit
  `--runInBand --watchman=false`, nachdem der Dateiwächter an Sandbox-Dateirechten scheiterte.
- Lesendes Zwei-Achsen-Review: keine Befunde gegen Projektstandards oder den freigegebenen
  Bus-Scope. Studio-Anforderungen wurden nicht als bereits implementiert bewertet.
- [Implementierungs-PR 14](https://github.com/smart-village-solutions/sva-bus-server/pull/14):
  nach sechs erfolgreichen PR-Prüfungen gemergt.
- Release-Commit auf main: `047723db2691839e781dc5b85553dafed33482a9`.
- [CI für den Release-Commit](https://github.com/smart-village-solutions/sva-bus-server/actions/runs/38879985396): erfolgreich.
- [Deploy Production](https://github.com/smart-village-solutions/sva-bus-server/actions/runs/38879985541):
  Image-Build, Quantum-Deployment und Workflow-Healthcheck erfolgreich.
- [Tag und GitHub-Release 0.7.3](https://github.com/smart-village-solutions/sva-bus-server/releases/tag/0.7.3): veröffentlicht.
- Öffentlicher Nachtest am 16. Oktober 2026: `/health` antwortet mit HTTP 200 und
  `status: ok`; `/internal/api-keys?label=sl-sankt-wendel` ohne Admin-Token antwortet
  mit HTTP 401 und `Cache-Control: no-store`.

Diese Nachweise bestätigen Build, veröffentlichte Abhängigkeit, öffentlichen Healthcheck
und Absicherung ohne Token. Die E2E-Tests nutzen den bestehenden Redis-Testadapter.
Sie belegen keine authentifizierte Prüfung echter Kunden-Keys gegen produktives Redis.
Diese noch offenen Prüfungen bleiben in den Studio-Aufgaben 4.1, 4.5 und 4.6 erhalten.

## Übergabe und Rollout-Grenze

Studio ergänzt den Bereich unter Betrieb der zentralen Instanzdetailseite, ausschließlich
für Root-Host-Plattform-Superadmins mit `instance_registry_admin`. Ein Tenant-`system_admin`
oder aktiviertes Modul verleiht keinen Zugriff. Root-Host, Session und Rolle werden an
jedem Studio-Endpunkt serverseitig geprüft; Schreibaktionen verwenden CSRF und Fresh-Reauth.

Der Studio-Change übernimmt alle ursprünglich offenen Punkte einschließlich `owner = displayName`,
`label = instanceId`, Pflicht-Kontakt und Initialen, inklusivem Gültigkeitsdatum mit UTC-Folgetag,
Einmalanzeige, manueller Rotation, Timeout-Verhalten, Audit, Bestandsprüfung und Rollout.
Er ist fachlich geplant, aber noch nicht implementiert oder abgenommen.

Der Bus-Release erfordert keine Datenmigration oder neue Env-Variable. Ein zukünftiger
Studio-Rückfall darf weder Keys löschen noch neu erzeugen; die bisherige Bus-Admin-Schnittstelle
bleibt bedienbar. Für den Bus-Rückfall gilt das bestehende Release-/Quantum-Verfahren.
