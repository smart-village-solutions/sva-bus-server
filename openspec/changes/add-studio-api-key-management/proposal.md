# Change: Bus-API-Keys in SVA Studio verwalten

## Why

Client-API-Keys für Kundeninstanzen werden bisher über die interne Admin-Schnittstelle
des Bus-Servers mit einem gemeinsamen Bearer-Token verwaltet. Damit hängt die Bedienung
von Personen ab, die diesen technischen Zugang besitzen. SVA Studio bietet bereits
Keycloak-Anmeldung, Superadmins und eine zentrale Kundeninstanzverwaltung.

## What Changes

- Die bestehende zentrale Instanzdetailseite in SVA Studio erhält einen Bereich
  „Bus-API-Keys“; dies ist kein pro Kundeninstanz aktivierbares Modul.
- Plattform-Superadmins mit `instance_registry_admin` können dort die Keys der geöffneten
  Instanz auflisten, erstellen, sperren und bei noch nicht abgelaufenen Keys reaktivieren.
- Tenant-Benutzer einschließlich tenantlokaler `system_admin` haben keinen Zugriff.
  Root-Host und Plattformrolle werden an jedem Studio-Server-Endpunkt geprüft.
- Studio verwendet die bestehende Anmeldung und ruft den Bus-Server ausschließlich
  serverseitig auf. Der Bus-Admin-Token bleibt ein Deployment-Secret.
- `owner` enthält die ausgeschriebene Ortsbezeichnung aus `displayName`; `label` enthält
  exakt die Studio-`instanceId`. Mehrere Keys pro Instanz bleiben für Rotation möglich.
- Beim Erstellen werden Kunden-Kontakt-E-Mail und Erstellerinitialen abgefragt.
- „Gültig bis einschließlich“ ist mit dem 31. Dezember des laufenden Jahres vorbelegt.
  Ein anderes zukünftiges Gültigkeitsende ist frei auswählbar; gespeichert wird der
  Tagesbeginn des Folgetags in UTC, entsprechend dem bestehenden Datenformat.
- Die Bus-Admin-Schnittstelle erhält additive Label-Filter und Label-Prüfungen für
  Änderungen sowie Audit-Kontext für den angemeldeten Studio-Benutzer.
- Bestehende Datensätze, Client-Keys und Proxy-Aufrufe bleiben kompatibel.

## Impact

| Anwendung / Bereich             | Verantwortung                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `sva-studio` – React-Oberfläche | Instanzbezogene Liste, Erstellformular, einmalige Key-Anzeige und Lifecycle-Aktionen                                  |
| `sva-studio` – Server-Runtime   | Root-Host-/Rollenprüfung, CSRF, Registry-Zuordnung, Eingabeprüfung, Bus-Aufrufe und Benutzer-Audit                    |
| `bb-bus-server`                 | Führende Key-Registry, Hashing, Ausgabe neuer Secrets, Label-Filter, Lifecycle und technisches Audit                  |
| Betrieb / Deployment            | Serververbindung, Secret-Konfiguration, mehrere persönliche Superadmin-Konten und gestufter Rollout                   |
| Mobile-App / Mainserver         | Keine Implementierungsänderung für diesen Ausbau; bei Rotation neuen Key im tatsächlich verwendenden Client verteilen |

- Betroffene Bus-Spezifikation: `backend-platform`.
- Studio-Umsetzung: bestehende Instanzverwaltung, Auth-Runtime, Routing und i18n;
  vor Implementierung den Change in die dort aktuell zuständigen Spezifikationen einordnen.
- In diesem Repository liegt der gemeinsame Plan mit dem Bus-Spezifikationsdelta;
  die Studio-Aufgaben werden im Studio-Repository umgesetzt.
- Die bestehende Bundesland-Auswahl über `x-federal-state` und die serverseitigen
  Infodienste-Zugangsdaten werden durch diesen Change nicht verändert.

## Lieferumfang und Abgrenzung

Der erste Ausbau nutzt die vorhandene Plattformrolle. Eigene Benutzerkonten im Bus-Server,
eine weitere Frontend-App, Kunden-Self-Service, zusätzliche Plattformrollen, automatische
Client-Konfiguration und neue Upstream-Key-Verwaltung gehören nicht zu diesem Change.
Das UI bietet zunächst kein endgültiges Löschen und kein nachträgliches Bearbeiten von
Key-Metadaten; zum Ersetzen wird ein neuer Key erstellt und der alte bewusst gesperrt.

## Abnahme

Der Ausbau ist abgenommen, wenn mindestens zwei berechtigte Personen mit eigenen
Studio-Konten unabhängig voneinander Keys für Kundeninstanzen verwalten können,
die vorhandenen Keys korrekt erscheinen und keine Admin-Secrets im Browser landen.
Ein neuer Key muss am Bus-Proxy funktionieren und nach Sperrung mit HTTP 401 abgewiesen
werden. Details, Lieferreihenfolge und Nachweise stehen in `design.md` und `tasks.md`.
