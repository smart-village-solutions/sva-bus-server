# Change: Instanzbezogene Bus-Key-Administration für SVA Studio vorbereiten

## Why

SVA Studio benötigt einen sicheren serverseitigen Bedienpfad für Kunden-API-Keys.
Der Bus-Server besitzt bereits die führende Key-Registry und den technischen Admin-Zugang;
dieser Change ergänzt die dafür erforderlichen instanzbezogenen Operationen und Auditdaten.

## What Changes

- Exakter optionaler `label`-Filter für die Key-Metadatenliste.
- Optionale Label-Vorbedingung vor Sperren und Reaktivieren; falsche Zuordnung ergibt 404
  ohne Änderung des Datensatzes. Bestehende Admin-Aufrufe bleiben kompatibel.
- Validierte optionale Actor-Assertion `x-admin-actor-id` nach Bearer-Prüfung, getrennt
  von technischer Admin-Identität und den eingegebenen `createdBy`-Initialen.
- `Cache-Control: no-store` für Admin-Antworten und Entfernen des Actor-Headers vor
  Weiterleitung von Proxy-Anfragen.

## Impact

- Betroffene Spezifikation: `backend-platform`; drei additive Anforderungen.
- Betroffene Implementierung: bestehender Admin-Guard, API-Key-Controller/-Service
  und Proxy-Headerfilter; keine neue Anwendung, Registry oder Datenmigration.
- Keine zusätzliche Benutzeranmeldung im Bus-Server. Die Plattform-Superadmin-Prüfung
  gehört in die ausschließlich serverseitige Studio-Fassade.

## Abschluss und Scope-Aufteilung

Dieser Change wurde ursprünglich als gemeinsamer Bus-/Studio-Plan angelegt. Am 16. Oktober 2026 wurde der veröffentlichte Bus-Anteil vom offenen Studio-Ausbau getrennt.
Abgeschlossen und archiviert wird ausschließlich der oben beschriebene Bus-Vertrag.

Die offenen Studio-Aufgaben einschließlich noch ausstehender Kunden-Key- und
Integrationsprüfungen werden im verknüpften Studio-Change
[add-bus-api-key-management](https://github.com/smart-village-solutions/sva-studio/tree/main/openspec/changes/add-bus-api-key-management)
fortgeführt. Dort bleiben Formular, Jahresenddatum, bestehende Registry-Zuordnung,
Root-Host-/Plattformrollen-Prüfung, persönliche Benutzerkonten und Studio-Rollout offen.
Die Funktion ist eine Einstellung der zentralen Instanzverwaltung, kein Tenant-Modul.
Ausschließlich Plattform-Superadmins mit `instance_registry_admin` erhalten Zugriff.

[Release 0.7.3](https://github.com/smart-village-solutions/sva-bus-server/releases/tag/0.7.3),
[Implementierungs-PR 14](https://github.com/smart-village-solutions/sva-bus-server/pull/14)
und der Produktionsnachweis sind in `design.md` dokumentiert.
