# free@home für Gladys

Diese eigenständige Integration nutzt ausschließlich die lokale REST- und
WebSocket-API von ABB/Busch-Jaeger, ohne XMPP oder Cloud-Verbindung. Implementiert
sind Schaltausgänge für Licht und andere Verbraucher, dimmbare Lichter, Rollos
und Jalousien sowie Wand-/Paneltaster als Auslöser für Gladys-Szenen.

## Einrichtung

Benötigt werden Gladys ab 5.1.0, ein kompatibler System Access Point mit aktivierter
lokaler API, seine Adresse einschließlich `http://` oder `https://`, der
API-Benutzername aus free@home next und dessen Passwort. Beide Zugangsdaten sind
in Gladys Geheimnisfelder. Sie sind vom eigenen Gladys-Integrationstoken getrennt.
Keine Zugangsdaten im Chat oder in Screenshots teilen.

Nach dem Speichern der Konfiguration erscheint der Verbindungsstatus. Der
Verbindungstest liest nur die REST-Konfiguration; erst der laufende Status
bestätigt auch die WebSocket-Verbindung. In „Entdeckung“ werden unterstützte
Kanäle angeboten. Die gewünschten Kanäle selbst anlegen und Räumen zuweisen.
Ein physischer Mehrfachaktor kann mehrere Einträge haben. Die Integration legt
keine Geräte automatisch an und löscht keine vorhandenen Geräte.

## Steuerung und Taster

Rolloposition und Lamellenöffnung sind **0 % geschlossen, 100 % offen**. Die
Lamellenregelung erscheint nur bei passenden Datenpunkten, als eigener Regler
in Prozent, nicht als kalibrierter Winkel in Grad. Auf/Ab/Stopp verwendet die
Aktorrückmeldung. Stopp liest vorher den Bewegungszustand: Im Stillstand wird
kein Schritt ausgelöst, bei unbekanntem Zustand kein Stopp gesendet. Zwischen
Abfrage und Befehl kann der Aktor allerdings selbst stoppen; ABB bietet hierfür
keine atomare Operation. Positionsrückmeldungen kommen teils erst nach Fahrtende.
0 % Helligkeit schaltet über den separaten Ausschalt-Datenpunkt aus.

Für Taster zuerst den Kanal anlegen, dann im Szeneneditor **Integrationen →
free@home → Tasteraktion** wählen. Das Tastergerät ist Pflicht, die Aktion kann
für „beliebig“ leer bleiben. Verfügbar sind je nach Taster Ein/Aus,
Heller/Dunkler/Dimmen stoppen sowie Auf/Ab/Stopp-Schritt auf oder ab.
Zwei identische aktuelle Telegramme lösen zwei Ereignisse aus. Die Anzeige der
letzten Aktion ist dagegen ein Zustand und kein zuverlässiger Tastendruck-Trigger.
Tastertelegramme sind keine allgemeine Rohdaten-API für Drücken/Loslassen oder
Doppelklicks. Snapshots und Initialsynchronisation lösen keine Szenen aus;
während einer Unterbrechung gehen Ereignisse verloren und werden nicht nachgeholt.

## Sicherheit und Entwicklungsstand

HTTP Basic verschlüsselt nicht: HTTPS mit vertrauenswürdigem Zertifikat
bevorzugen; private Zertifizierungsstellen über `NODE_EXTRA_CA_CERTS` einbinden.
TLS-Prüfung nicht abschalten und die Controller-API nie ins Internet freigeben.
Befehle werden nach Fehlern oder Wiederverbindung niemals automatisch wiederholt.
Ein fehlendes ACK bedeutet nicht sicher, dass ein Befehl nicht ausgeführt wurde.

Zusätzlich zu simulierten Tests wurden mit ausdrücklicher Freigabe an Firmware
3.5.3 Licht An/Aus, Rollopositionierung, Auf/Stopp, wiederholte identische
Taster-Szenenereignisse und Neustart/Wiederverbindung geprüft. Dimmen, Lamellen,
die andere Tasterseite und der separate Abwärtsbefehl sind noch nicht an echter
Hardware geprüft. Gruppen, virtuelle Geräte, free@home-Szenen und weitere
Sensor-/Heizungsfunktionen gehören nicht zu diesem Umfang. Kein Store-Eintrag
und keine Veröffentlichung.

## Automatischer Start auf dem Mac

Nach der eigenen lokalen Registrierung den manuellen Integrationsprozess
beenden und `npm run service:install` ausführen. Ein eigener Benutzer-LaunchAgent
startet die Integration bei Anmeldung und nach Prozessende erneut. Status:
`npm run service:status`; Neustart: `npm run service:restart`; Entfernen und
Beenden: `npm run service:uninstall`. Registrierung und Geräte bleiben erhalten.
Logs liegen geschützt unter `data/runtime.log`; Zugangsdaten bleiben in `.env`,
nicht in der plist. Nicht gleichzeitig `npm start` ausführen.

Gladys und Docker starten weiterhin separat. Bei Abmeldung oder schlafendem Mac
läuft die Integration nicht; dies ist kein 24/7-Serverbetrieb. Nach einem Wechsel
des Node-Pfads oder Projektordners den LaunchAgent vom bisherigen Ordner aus
entfernen und neu installieren. Einzelheiten und die geschützten Eingabedialoge
stehen im [README](../README.md#4-native-macos-autostart).
