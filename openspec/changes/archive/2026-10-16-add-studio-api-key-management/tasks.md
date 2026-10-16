## 1. Freigabe und Implementierung des Bus-Vertrags

- [x] 1.1 Bus-Vertrag und Scope durch den Nutzer freigeben lassen; Studio-Zugriff ausschließlich für Plattform-Superadmins festhalten.
- [x] 1.2 Optionalen exakten Label-Filter für die Metadatenliste ergänzen; leere und wiederholte Filter ablehnen.
- [x] 1.3 Sperren/Reaktivieren um eine Label-Vorbedingung ergänzen; fremde oder unbekannte Key-IDs vor Änderung mit 404 ablehnen.
- [x] 1.4 Validierte optionale Studio-Actor-ID erst nach Bearer-Prüfung akzeptieren und zusammen mit technischer Identität und Request-ID auditieren.
- [x] 1.5 Admin-Antworten gegen Caching schützen und Actor-Header vor Upstream-Weiterleitung entfernen.
- [x] 1.6 Tests, README und Interface-Dokumentation ergänzen; bestehende Aufrufe kompatibel halten.

## 2. Prüfung und Veröffentlichung

- [x] 2.1 137 Unit-Tests, 48 E2E-Tests, Lint, Build, Format- und strikte OpenSpec-Prüfung erfolgreich abschließen.
- [x] 2.2 Lesendes Review gegen Projektstandards und freigegebenen Bus-Scope ohne Befunde abschließen.
- [x] 2.3 Release-PR 14 nach erfolgreichen GitHub-Prüfungen mergen; Version und Tag 0.7.3 veröffentlichen.
- [x] 2.4 Erfolgreichen Produktions-Workflow für Commit `047723db2691839e781dc5b85553dafed33482a9` und öffentlichen Healthcheck nachweisen.
- [x] 2.5 Admin-Zugriff ohne Token in Produktion mit 401 und `Cache-Control: no-store` bestätigen.

## 3. Dokumentarischer Abschluss

- [x] 3.1 Alle offenen Studio-Aufgaben samt noch ausstehenden Bestands-/Integrationsprüfungen in den verknüpften Studio-Change `add-bus-api-key-management` überführen.
- [x] 3.2 Den archivierten Scope auf die veröffentlichte Bus-Funktion begrenzen und Release-Nachweise mit ihren Grenzen festhalten.

## Übertragene offene Aufgaben und Nachweisgrenzen

Der ursprüngliche Plan umfasste 34 Aufgaben. Die sieben bereits erledigten Punkte
waren Freigabe und Bus-Implementierung. Die übrigen 27 Aufgaben wurden nicht pauschal
abgehakt, sondern in das Studio-Projekt übernommen; dessen `tasks.md` enthält eine
Zuordnung der alten und neuen Aufgabennummern. Bei der Überführung wurde nur die
Studio-Spezifikationseinordnung tatsächlich erledigt.

Die ursprüngliche Aufgabe 5.1 war gemischt: Der Bus-Deploy ist abgeschlossen; die
Prüfung vorhandener echter Kunden-Keys und manueller authentifizierter Admin-Aufrufe
ist weiterhin offen und wird dort als Aufgabe 4.1 fortgeführt. Auch gemeinsame
Lifecycle-/Rotationsprüfungen, Konten, Secrets und der Studio-Rollout bleiben dort offen.

Die Bus-E2E-Nachweise nutzen Fastify-Injection und den bestehenden Redis-Testadapter.
Produktive Keys wurden für diesen Abschluss weder erstellt, gesperrt noch geändert.
