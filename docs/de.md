# free@home für Gladys

Diese eigenständige Integration nutzt ausschließlich die lokale REST- und
WebSocket-API von ABB/Busch-Jaeger, ohne XMPP oder Cloud-Verbindung. Implementiert
sind Schaltausgänge für Licht und andere Verbraucher, dimmbare Lichter, Rollos
und Jalousien sowie Wand-/Paneltaster als Auslöser für Gladys-Szenen.

## Einrichtung

Die Integration läuft in einem eigenen **Linux-Docker-Container unter Gladys**.
Gladys übernimmt Start, Neustart, Protokolle und Integrationstoken. Nutzer brauchen
weder macOS noch Node.js auf ihrem Rechner, ein Quellcodeverzeichnis oder `.env`.
Es gibt noch kein veröffentlichtes Image und keinen Store-Eintrag. Für private
Tests das selbst gebaute Image im Gladys-Entwicklermodus installieren; die
[Entwicklungsanleitung](development.md) ist von der normalen Einrichtung getrennt.

Benötigt werden Gladys ab 5.1.0 mit Docker, ein kompatibler System Access Point mit aktivierter
lokaler API, seine Adresse einschließlich `http://` oder `https://`, der
API-Benutzername aus free@home next und dessen Passwort. Beide Zugangsdaten sind
in Gladys unter „Konfiguration“ einzugeben, als Geheimnisfelder. Sie sind vom eigenen Gladys-Integrationstoken getrennt.
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

## Betrieb und Updates

Start/Stopp, Neustart, Logs und Updates erfolgen über Gladys. Der Gladys-/Docker-
Host muss laufen; der Entwicklerrechner wird nicht benötigt. Für Updates die
Updatefunktion verwenden, nicht deinstallieren: Eine Deinstallation in Gladys
löscht auch Registrierung, Konfiguration und Geräte. Der Container erhält seine
Konfiguration aus Gladys, enthält keine persönlichen Zugangsdaten und benötigt
keine lokalen persistenten Dateien.
