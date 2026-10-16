# Entwurf und anwendungsbezogener Umsetzungsplan

Stand: 16. Oktober 2026. Status: vom Nutzer zur Umsetzung freigegeben;
Bus-Server zuerst, anschließend Studio-Integration.

## 1. Ausgangslage

### Bus-Server

- `src/api-keys/api-keys-admin.controller.ts` bietet Erstellen, Auflisten, Sperren,
  Reaktivieren und Löschen unter `/internal/api-keys`.
- `src/api-keys/admin-auth.guard.ts` prüft den gemeinsamen `ADMIN_API_TOKEN`.
- `src/api-keys/api-keys.service.ts` speichert Keys mit Hash und Metadaten in Redis;
  nur beim Erstellen wird der Klartext-Key zurückgegeben.
- `owner`, `label`, `contact`, `createdBy` und `expiresAt` bestehen bereits.
  `label` ist bislang optional und kein eigenständig geprüftes Instanzmerkmal.
- Es gibt keine Frontend-App oder Benutzeranmeldung im Bus-Server.

### SVA Studio

Projektpfad: `/Users/daniel/Development/smart-village-app/sva-studio`.

- `packages/routing/src/route-paths.ts` enthält `/admin/instances/$instanceId`.
- `apps/sva-studio-react/src/routes/admin/instances/` enthält die bestehende Detailoberfläche.
- `packages/core/src/iam/account-instance-contract.ts` liefert `instanceId` und `displayName`.
- `packages/instance-registry/src/http-guards.ts` prüft Root-Host und
  `instance_registry_admin`; für kritische Mutationen besteht ein Fresh-Reauth-Vertrag.
- `packages/auth-runtime/src/iam-instance-registry/` bindet Session, CSRF und Registry an.
- Der vorhandene Mainserver-Abschnitt im Instanzdetail ist eine Referenz für eine
  instanzbezogene technische Integration, aber kein Speicherort für Bus-Keys.
- Plattform-Benutzer werden aus dem Root-Keycloak-Realm gelesen. Die Studio-Liste
  blendet die Benutzeranlage im Plattformkontext derzeit aus.
- Eine produktive Bus-Key-Integration wurde im untersuchten Quellstand nicht gefunden.

## 2. Zuständigkeiten und Ausführung

Der Aufrufpfad lautet:

`Browser mit Studio-Session → Studio-Server → Bus-Admin-Schnittstelle → Redis`

Studio besitzt die Benutzerautorisierung und prüft die angeforderte Kundeninstanz gegen
seine Registry. Der Bus-Server bleibt führend für Key-Datensätze, Gültigkeit und Sperrung.
Es entsteht keine zweite Key-Registry in der Studio-Datenbank und kein direkter
Redis-Zugriff aus Studio. Der Klartext-Key wird ausschließlich zur Übergabe an den
Operator einmalig durchgereicht.

Für den ersten Ausbau verwendet der Studio-Server den vorhandenen Bus-Admin-Token.
Dieser besitzt die bestehenden umfassenden Adminrechte und ist nur für den vertrauenswürdigen
Studio-Server bestimmt. Menschliche Bediener melden sich mit persönlichen Studio-Konten an.
Im Browser prüft die Navigation denselben Plattformzugriff wie die Instanzdetailseite;
der Studio-Server erzwingt Root-Host, Session und Rolle unabhängig davon erneut.

Tenant-`system_admin` und eine reine Tenant-Session erhalten keinen Zugriff auf diese
Plattformfunktion. Bestehende Instanz-Mutationsregeln einschließlich CSRF und der
angemessenen Fresh-Reauth-Prüfung werden für die neuen Schreibaktionen wiederverwendet.
Neue Plattformrollen oder frei wählbare Bus-Zieladressen sind nicht erforderlich.

## 3. Datenvertrag und Formular

| Feld                                | Herkunft und Regel                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `keyId`                             | Wird vom Bus-Server erzeugt                                                                     |
| `owner`                             | Studio-Server lädt den ausgeschriebenen Namen aus `displayName` der Registry                    |
| `label`                             | Studio-Server setzt exakt die `instanceId` aus dem geprüften Routen-Kontext                     |
| `contact`                           | Pflichtfeld im Formular, syntaktisch gültige Kunden-Kontakt-E-Mail, getrimmt                    |
| `createdBy`                         | Pflichtfeld für die Initialen der aktuell erstellenden Person, getrimmt                         |
| `expiresAt`                         | Studio-Server berechnet den exklusiven Ablaufzeitpunkt aus dem gewählten letzten Gültigkeitstag |
| `createdAt`, `revoked`, `revokedAt` | Werden vom Bus-Server geführt                                                                   |

Ort und Instanz-ID werden im Formular angezeigt. Der Browser darf sie beim Erstellen
nicht frei festlegen; der Server leitet sie aus der Registry ab. Vor dem Rollout ist
zu prüfen, ob `displayName` den gewünschten Ortsbezeichnungen entspricht. Historische
`owner`-Werte werden nicht automatisch überschrieben, wenn sich der Anzeigename ändert.

E-Mail und Initialen werden bei jeder Erstellung bestätigt. Eine Vorbelegung der Initialen
ist nur ein editierbarer Vorschlag aus dem angemeldeten Namen; die manuelle Eingabe bleibt
möglich. Es entsteht dafür kein neues Benutzerprofilfeld. Initialen sind fachliche Metadaten,
die tatsächliche Audit-Identität stammt separat aus der serverseitigen Session.

### Datum und Zeitzone

- Die Beschriftung lautet „Gültig bis einschließlich“.
- Standard ist der 31. Dezember des aktuellen Kalenderjahres in `Europe/Berlin`;
  die Berechnung erfolgt beim Öffnen des Formulars, ohne hart codiertes Jahr.
- Ein beliebiger anderer letzter Gültigkeitstag ist auswählbar, sofern der daraus
  berechnete Ablaufzeitpunkt beim Absenden noch in der Zukunft liegt.
- Beispiel Standard: `2026-12-31` wird zu `2027-01-01T00:00:00.000Z`.
- Beispiel Auswahl: `2027-03-15` wird zu `2027-03-16T00:00:00.000Z`.
- UTC entspricht den vorhandenen Beispieldatensätzen. Der exakte Ablauf wird zusätzlich
  als UTC-Zeitpunkt erklärt; es wird nicht stillschweigend lokale Berliner Mitternacht
  gespeichert. `2027-01-01T00:00:00Z` entspricht in Berlin 01:00 Uhr.
- Der Server nimmt ein Date-only-Feld `validThrough` an und berechnet den Folgetag mit
  Kalenderarithmetik in UTC. Browser-Zeitzone und Sommerzeit dürfen den Tag nicht verschieben.
- Historische beliebige `expiresAt`-Zeitpunkte werden als exakte Zeitpunkte angezeigt;
  nur exakt passende UTC-Tagesgrenzen erhalten die neue inklusive Datumsdarstellung.
- Fehlendes Ablaufdatum bei einem Alt-Key wird als „ohne Ablaufdatum“ dargestellt.

## 4. SVA Studio: konkrete Aufgaben

Die Verwaltung ist eine Einstellung der zentralen Instanzverwaltung, kein aktivierbares
Tenant-Modul. Ausschließlich Plattform-Superadmins auf dem Root-Host dürfen den Bereich
und seine Server-Endpunkte nutzen. Die gewählte Kundeninstanz bestimmt die Zuordnung
des Keys, verleiht deren Benutzern aber keinerlei Zugriff. Diese Einschränkung gilt
auch für tenantlokale `system_admin` und direkte Aufrufe der Server-Endpunkte.

### Oberfläche

Die bestehende Instanzdetailseite erhält im Bereich „Betrieb“ einen Abschnitt
„Bus-API-Keys“, passend zu den vorhandenen Studio-UI-Bausteinen. Die Liste zeigt
Kontakt, Erstellerinitialen, Erstellung, Gültigkeitsende und Status sowie die Key-ID
zur Identifikation. Ein Instanzwechsel verwirft Formularzustand und Secret-Anzeige;
verspätete Antworten der zuvor geöffneten Instanz dürfen nicht erscheinen.

„Key erstellen“ öffnet das beschriebene Formular. Nach erfolgreicher Erstellung erscheint
der Klartext-Key mit expliziter Kopieraktion und Hinweis auf die einmalige Anzeige.
Er bleibt nur im flüchtigen UI-Zustand und wird weder in Browser-Speichern noch in
URLs, Analytics, Logs oder Fehlertelemetrie abgelegt. Metadatenlisten enthalten ihn nie.

Sperren verlangt eine Bestätigung. Reaktivieren ist für gesperrte, noch nicht abgelaufene
Keys verfügbar. Abgelaufene Keys werden durch neue ersetzt; Reaktivieren verlängert
kein Ablaufdatum. Rotation besteht aus „neuen Key erstellen → im Client ausrollen und
prüfen → alten Key bewusst sperren“. Das Erstellen sperrt vorhandene Keys nicht automatisch.

Alle Texte werden deutsch und englisch über das bestehende i18n-System gepflegt.
Formular, Dialoge und Tabellen verwenden die bestehenden Design-System-Bausteine.

### Server und Interface zum Browser

Vorgesehene Pfade unter dem bestehenden Instanz-Routing:

| Methode und Pfad                                                      | Zweck                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------- |
| `GET /api/v1/iam/instances/:instanceId/bus-api-keys`                  | Metadaten dieser Instanz lesen                           |
| `POST /api/v1/iam/instances/:instanceId/bus-api-keys`                 | Key mit `contact`, `createdBy`, `validThrough` erstellen |
| `POST /api/v1/iam/instances/:instanceId/bus-api-keys/:keyId/revoke`   | Zugehörigen Key sperren                                  |
| `POST /api/v1/iam/instances/:instanceId/bus-api-keys/:keyId/activate` | Zugehörigen, nicht abgelaufenen Key reaktivieren         |

Die Implementierung erweitert das bestehende Root-Host-/Instanz-Routing und dessen
Server-Guards. Browser-Aufrufe werden in den vorhandenen Instanz-Client eingebunden,
etwa in `apps/sva-studio-react/src/lib/iam-api-instances.ts`; kein neues Workspace-Package
ist erforderlich. Ein fokussierter serverseitiger Bus-Adapter kapselt feste Ziel-Origin,
Bearer-Token, Timeout, zulässige Operationen und sichere Fehlerabbildung, da hierfür
bisher kein Bus-Aufrufpfad besteht. Er gehört in den bestehenden Studio-Serverpfad.

Die Registry-Existenz wird vor jedem Aufruf geprüft. Auflisten und Sperren bleiben auch
für suspendierte beziehungsweise archivierte Bestandsinstanzen möglich. Neue Keys und
Reaktivierungen sind im ersten Ausbau auf aktive Instanzen beschränkt. Studio prüft
E-Mail, Initialen und Datum client- und serverseitig und gibt keine ungeprüften Bus-Fehler
an den Browser weiter. Admin-Antworten erhalten `Cache-Control: no-store`.

## 5. Bus-Server: konkrete Aufgaben

Die bestehenden Controller-/Service-Methoden werden additiv erweitert:

- `GET /internal/api-keys?label=<instanceId>` filtert exakt auf `label`, ohne Präfix-,
  Anzeigenamen- oder Teilstring-Zuordnung. Ohne Filter bleibt der bestehende Admin-Aufruf
  kompatibel. Auch ein leerer angegebener Filter wird nicht als globale Liste interpretiert.
- Bei `POST /internal/api-keys/:keyId/revoke` und `/activate` kann Studio denselben
  `label`-Kontext als Query-Parameter übergeben. Der Bus-Server prüft vor der Änderung
  die Zugehörigkeit des gespeicherten Keys; ein fremder oder unbekannter Key ergibt 404.
- Studio setzt `owner` und `label` bei Erstellung aus der Registry; der Bus-Server benötigt
  dafür keine Verbindung zur Studio-Datenbank. Bestehende manuelle Admin-Aufrufe bleiben möglich.
- Ein optionaler, begrenzter und validierter Header `x-admin-actor-id` transportiert bei
  authentifizierten Admin-Aufrufen die von Studio ermittelte Root-Benutzer-ID. Er wird
  erst nach erfolgreicher Bearer-Prüfung verwendet und niemals als Anmeldenachweis behandelt.
- Audit enthält weiterhin die technische Token-Identität und zusätzlich den behaupteten
  Studio-Akteur sowie `x-request-id` zur Korrelation. Die Zuverlässigkeit der Personenangabe
  beruht auf dem vertrauenswürdigen Studio-Server und dessen Audit, nicht auf den Initialen.
- API-Key-Klartext, Hash, Admin-Token und Kontakt-E-Mail werden nicht in Auditdetails geloggt.
- Admin-Antworten werden mit `Cache-Control: no-store` geschützt. Eine ausgehende
  Proxy-Anfrage übernimmt keine zusätzlichen Admin-Header.

Die Key-Registry bleibt unverändert in Redis. Ein zusätzliches `instanceId`-Feld,
ein Schemawechsel und eine automatische Umschreibung aller bestehenden Keys sind nicht nötig.

## 6. Fehlerfälle und Nachvollziehbarkeit

- Bei fehlender Bus-Konfiguration oder nicht erreichbarem Bus-Server zeigt der Abschnitt
  einen lokalen Fehlerzustand; die restliche Instanzverwaltung bleibt bedienbar.
- Schreibaufrufe werden bei Timeouts nicht automatisch wiederholt. Insbesondere kann
  ein Key bereits erstellt worden sein, obwohl seine Antwort verloren ging. Das UI
  erklärt den unklaren Ausgang, lädt die Metadaten neu und ermöglicht bewusstes Sperren
  und erneutes Erstellen. Ein späteres GET kann den verlorenen Klartext nicht wiederherstellen.
- Ein Bus-Fehler oder ein nachgelagerter Studio-Auditfehler darf keine automatische
  erneute Key-Erstellung auslösen. Ein bestätigter Bus-Erfolg bleibt als solcher sichtbar;
  ein Auditfehler wird separat korreliert gemeldet.
- Studio verwendet für Mutationen den vorhandenen Plattform-/Instanz-Auditpfad mit
  Benutzer-ID, Instanz-ID, Key-ID, Aktion, Ergebnis und Request-ID. Die Ergänzung der
  bestehenden Audit-Eventtypen wird vor Umsetzung gegen deren Repository-Vertrag geprüft.
- Beide Seiten verifizieren den Label-Kontext; eine manipulierte `keyId` darf keine
  Änderung an einer anderen Instanz auslösen. Dies ist eine Management-Zuordnung und
  schränkt bestehende mobile Proxy-Keys nicht automatisch auf ein Bundesland ein.

## 7. Betrieb, Bestand und Rollout

1. Bestehende Key-Metadaten ohne Secrets exportieren und jedes `label` exakt gegen die
   Studio-Registry prüfen. Die Beispiele `sl-sankt-wendel` und `bb-prignitz` dienen als
   Prüffälle, sofern diese IDs tatsächlich in der Registry existieren. Abweichungen
   werden manuell geklärt; es gibt keine automatische Ableitung aus Ortsnamen.
2. Bus-Erweiterung kompatibel ausrollen. Vorhandene Mobile-Keys und manuelle Admin-Aufrufe prüfen.
3. Im Studio-Deployment serverseitig `BUS_API_BASE_URL` und `BUS_API_ADMIN_TOKEN`
   bereitstellen; der zweite Wert entspricht dem Bus-`ADMIN_API_TOKEN`. Keine `VITE_`-
   Variablen und kein Browser-Konfigurations-Endpunkt dürfen das Secret transportieren.
   Entwicklungs-, Staging- und Produktionszugänge bleiben getrennt. Für Remote-Ziele
   ist HTTPS erforderlich; lokale HTTP-Testziele bleiben auf das lokale Profil begrenzt.
4. Mindestens zwei Personen im passenden Root-Keycloak-Realm mit persönlichen Konten
   und `instance_registry_admin` ausstatten. Bestehende MFA-/Recovery-Regeln anwenden.
   Die Kontoanlage erfolgt vorerst über die vorhandene Keycloak-Administration.
5. Studio über seinen kanonischen GitHub-Actions-Rollout nach Dev, Staging und Production
   ausrollen; Referenz ist `docs/guides/studio-rollout-process.md` im Studio-Repository.
   Den Bus-Server über dessen bestehendes `Deploy Production`-Verfahren ausrollen.
6. In Staging mit einem Test-Key Erstellen, Benutzen, Sperren und Reaktivieren prüfen;
   beide Personen müssen den vollständigen Bedienpfad ausführen können.
7. Rückfall: Studio-Änderung zurückrollen beziehungsweise dessen Bus-Konfiguration
   deaktivieren. Die bisherige Admin-Schnittstelle bleibt verfügbar; bestehende Keys
   werden durch diesen Rückfall weder gelöscht noch neu erzeugt.

Das bestehende Studio-Datenmodell reicht voraussichtlich aus. Falls der vorhandene
Auditvertrag für neue Eventtypen eine Migration verlangt, wird ausschließlich dieser
belegte Bedarf umgesetzt und der Studio-Schema-Snapshot entsprechend aktualisiert.

## 8. Lieferabschnitte und Nachweise

| Abschnitt | Repository / Verantwortlicher | Ergebnis und Nachweis                                                                           |
| --------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| 1         | Beide Repositories            | Freigegebener Vertrag, Datumsregeln, Scope und Zuordnung der Studio-Spezifikationen             |
| 2         | Bus-Server                    | Additive Filter-/Mutationsprüfung und Audit; gezielte Jest-Tests und bestehende Pflichtchecks   |
| 3         | SVA Studio Server             | Autorisierte Instanz-Endpunkte, Bus-Adapter und Audit; negative Host-/Rollen-/CSRF-/Scope-Tests |
| 4         | SVA Studio UI                 | Instanzbereich mit Formular und Secret-Anzeige; gezielte Vitest-/Typ- und Browser-Tests         |
| 5         | Betrieb / beide Apps          | Secrets, persönliche Konten, Bestandsprüfung und gestufter Integrationsnachweis                 |

Kritische Nachweise sind: kein Bus-Secret im Browser-Bundle oder in Antworten, kein Zugriff
ohne Root-Host und Plattformrolle, keine Mutation mit fremder Key-ID, korrekte UTC-Ablaufgrenze,
kein erneutes Auslesen eines Klartext-Keys und erfolgreiche Sperrwirkung am echten Proxy.
Datumsprüfungen decken Jahreswechsel, Schaltjahr und unterschiedliche Browser-Zeitzonen ab.

## 9. Spätere Ausbauten

Ablauferinnerungen, automatische Client-Verteilung und eine Bestands-Prüfliste im UI
sind mögliche eigenständige Folgearbeiten. Sie sind keine Voraussetzung für den ersten Ausbau.
Die Verwaltung bleibt ausschließlich Plattform-Superadmins vorbehalten.
