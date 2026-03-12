In dieser Datei wird erläutert, wie Visual Studio das Projekt erstellt hat.

Folgende Tools wurden zur Erstellung dieses Projekts verwendet:
- create-vite

Folgende Schritte wurden zur Erstellung dieses Projekts verwendet:
- Erstellen Sie ein VUE-Projekt mit create-vite: `npm init --yes vue@latest fabrik3d.client -- --eslint  --typescript `.
- Aktualisieren Sie `vite.config.ts`, um Proxys und Zertifikate einzurichten.
- Fügen Sie `@type/node` für `vite.config.js`-Eingabe hinzu.
- Aktualisieren Sie `HelloWorld`, um Wetterinformationen abzurufen und anzuzeigen.
- Fügen Sie `shims-vue.d.ts` für Basistypen hinzu.
- Projektdatei (`fabrik3d.client.esproj`) erstellen.
- Erstellen Sie `launch.json`, um das Debuggen zu aktivieren.
- Projekt zur Projektmappe hinzufügen.
- Aktualisieren Sie den Proxyendpunkt als Backend-Serverendpunkt.
- Fügen Sie das Projekt zur Liste der Startprojekte hinzu.
- Schreiben Sie diese Datei.
