## 1. Gemeinsamer Vertrag und Freigabe

- [x] 1.1 Proposal und Design prüfen und den Ausbau ausschließlich für `instance_registry_admin` freigeben (Nutzerfreigabe vom 16. Oktober 2026).
- [ ] 1.2 Im aktuellen Studio-Quellstand die zuständigen Instanz-/Auth-/Routing-Spezifikationen prüfen und den dortigen Change samt betroffener arc42-Abschnitte einordnen.
- [ ] 1.3 `label = instanceId`, `owner = displayName`, Pflichtfelder und inklusive UTC-Datumsregel in beiden Umsetzungen übernehmen.
- [ ] 1.4 Bestehende Labels exakt gegen die Studio-Registry prüfen; abweichende IDs und nicht passende Ortsnamen vor Verwendung klären.

## 2. Bus-Server: bestehende Key-Verwaltung erweitern

- [x] 2.1 In `src/api-keys/api-keys-admin.controller.ts` und `api-keys.service.ts` den optionalen exakten Label-Filter für die Liste ergänzen; leere Filter ablehnen.
- [x] 2.2 Sperren und Reaktivieren um eine optionale Label-Vorbedingung ergänzen; fremde und unbekannte Key-IDs vor Mutation mit 404 ablehnen.
- [x] 2.3 Authentifizierten Studio-Akteur über validierten `x-admin-actor-id` zusätzlich zur technischen Token-Identität auditieren und vorhandene Request-ID-Korrelation nutzen.
- [x] 2.4 `Cache-Control: no-store` für Admin-Antworten ergänzen und sicherstellen, dass neue Admin-Header nicht zum Upstream gelangen.
- [x] 2.5 Gezielte Unit-/E2E-Tests für Filter, falsche Zuordnung, Auth, Audit-Redaktion, Einmalanzeige und bestehende Aufrufe ohne Label-Vorbedingung ergänzen.
- [x] 2.6 Relevante README-/Admin-Dokumentation aktualisieren und Format, Lint, Jest, Build sowie den betroffenen E2E-Pfad prüfen.

Prüfnachweis Bus-Server vom 16. Oktober 2026: 137 Unit-Tests und 48 E2E-Tests erfolgreich,
ebenso `npm run lint`, `npm run build`, `npm run format:check` und die strikte OpenSpec-Validierung.
Jest wurde mit `--runInBand --watchman=false` ausgeführt, nachdem der lokale Dateiwächter
im ersten Versuch an Sandbox-Dateirechten scheiterte. Die E2E-Tests verwenden Fastify-Injection
und den bestehenden Redis-Testadapter; ein Produktionsrollout oder ein Nachweis gegen
produktives Redis ist damit nicht erfolgt. Abschnitt 5 bleibt offen.

## 3. SVA Studio: Server-Integration

- [ ] 3.1 Die bestehenden Registry-Guards für Root-Host, Session, Plattformrolle, CSRF und Fresh-Reauth in die neuen Bus-Key-Handler einbinden; vorhandenes Routing erweitern.
- [ ] 3.2 `BUS_API_BASE_URL` und `BUS_API_ADMIN_TOKEN` in die bestehende serverseitige Konfigurationsvalidierung und den Deployment-Vertrag aufnehmen; fehlende Integration lokal im Abschnitt melden.
- [ ] 3.3 Einen fokussierten serverseitigen Bus-Adapter im vorhandenen Serverpfad ergänzen, mit fester Ziel-Origin, Timeout, sicherer Fehlerabbildung und ohne automatische Write-Retries.
- [ ] 3.4 Instanzgebundene GET-/POST-/revoke-/activate-Endpunkte gemäß Design implementieren; Instanz und `owner`/`label` serverseitig aus der Registry auflösen.
- [ ] 3.5 Kontakt, Initialen und `validThrough` validieren, Ablaufzeitpunkt in UTC berechnen und abgelaufene Reaktivierungen sowie Erstellung/Reaktivierung außerhalb aktiver Instanzen ablehnen.
- [ ] 3.6 Audit im bestehenden Plattform-/Instanzpfad ergänzen; Session-Benutzer-ID statt Initialen als tatsächlichen Akteur verwenden und Bus-Erfolg bei Auditfehler nicht erneut ausführen.
- [ ] 3.7 Den bestehenden Instanz-HTTP-Client für die neuen Pfade erweitern; Metadaten und einmalige Erstellantwort als getrennte Typen modellieren.
- [ ] 3.8 Gezielte Tests für Host, Rollen, CSRF, Registry-Existenz, manipulierte Key-ID, Datumsgrenzen, Timeouts und Secret-Redaktion durchführen; vorgeschriebene Studio-Auth-/Server-Runtime-Gates erfüllen.

## 4. SVA Studio: Instanzdetail und Formular

- [ ] 4.1 „Bus-API-Keys“ als ausschließlich Plattform-Superadmins zugänglichen Bereich unter „Betrieb“ der zentralen Instanzdetailseite integrieren; kein aktivierbares Tenant-Modul anlegen und vorhandene Tabellen, Dialoge und Statusbausteine nutzen.
- [ ] 4.2 Keys ausschließlich mit exakt passendem Label anzeigen; Laden, leerer Bestand, fehlende Integration und Fehler verständlich darstellen.
- [ ] 4.3 Erstellformular mit angezeigtem Ort/Instanz-ID sowie verpflichtender Kunden-E-Mail und editierbaren Erstellerinitialen ergänzen.
- [ ] 4.4 Datumsfeld „Gültig bis einschließlich“ mit Jahresende vorbelegen, freie gültige Auswahl und Erklärung des genauen UTC-Ablaufs anbieten.
- [ ] 4.5 Neuen Klartext-Key einmalig mit Kopieraktion anzeigen; beim Schließen oder Instanzwechsel aus dem UI-Zustand entfernen und keine Browser-Persistenz verwenden.
- [ ] 4.6 Bestätigtes Sperren, Reaktivieren gültiger gesperrter Keys und manuelle Rotation mit bewusstem späterem Sperren des alten Keys anbieten.
- [ ] 4.7 Unklaren Erstellungsausgang nach Timeout darstellen, Metadaten neu laden und niemals automatisch erneut erstellen; verspätete Antworten nach Instanzwechsel verwerfen.
- [ ] 4.8 Texte in Deutsch/Englisch sowie Tastaturbedienung und zugängliche Formularfehler ergänzen.
- [ ] 4.9 Gezielte Vitest-/Typ- und Browser-Tests für Formular, Einmalanzeige, Instanzwechsel, Datum, Sperren/Reaktivieren und unberechtigte Zugriffe durchführen.

## 5. Betrieb und gemeinsame Abnahme

- [ ] 5.1 Bus-Erweiterung zuerst kompatibel ausrollen und bestehende Client-Keys sowie manuelle Admin-Aufrufe prüfen.
- [ ] 5.2 Studio-Serververbindung und Secrets für die jeweilige Umgebung konfigurieren; Build-Ausgaben und HTTP-Antworten auf unbeabsichtigte Secret-Ausgabe prüfen.
- [ ] 5.3 Mindestens zwei persönliche Root-Keycloak-Konten mit berechtigtem Plattformzugriff bereitstellen und deren unabhängigen Login prüfen.
- [ ] 5.4 Studio nach kanonischem Rollout-Prozess über Dev und Staging veröffentlichen; Kontakt/Initialen und Jahresend-Standard anhand der Beispielinstanzen prüfen.
- [ ] 5.5 Mit Test-Key den vollständigen Proxy-Aufruf mit `x-api-key` und konfiguriertem `x-federal-state` prüfen; nach Sperren 401 und nach zulässiger Reaktivierung wieder Erfolg nachweisen.
- [ ] 5.6 Zwei gleichzeitig gültige Keys für manuelle Rotation und die gezielte Sperrung nur des alten Keys prüfen.
- [ ] 5.7 Produktionsrollout und Rückfallpfad dokumentieren; Aufgaben erst nach tatsächlichem Nachweis abschließen.
