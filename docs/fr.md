# free@home pour Gladys

Cette intégration indépendante utilise uniquement les API REST et WebSocket
locales d’ABB/Busch-Jaeger, sans XMPP ni API cloud. Elle implémente les sorties
commutées, les éclairages variables, les stores/volets et les actions des boutons
muraux ou de panneaux comme déclencheurs de scènes Gladys.

## Configuration

L’intégration fonctionne dans son propre **conteneur Docker Linux supervisé par
Gladys**. Gladys gère le démarrage, les redémarrages, les journaux et le jeton.
L’utilisateur n’a besoin ni de macOS, ni de Node.js sur son ordinateur, ni du code
source ou d’un fichier `.env`. Aucune image ni fiche Store n’est encore publiée.
Pour les essais privés, installez une image construite localement en mode
développeur Gladys ; voir le [guide de développement](development.md) séparé.

Il faut Gladys 5.1.0+ avec Docker, un SysAP compatible dont l’API locale est activée, son
origine avec `http://` ou `https://`, le nom d’utilisateur API indiqué dans
free@home next et son mot de passe. Saisissez ces identifiants dans les champs secrets de Configuration dans Gladys,
distincts du jeton Gladys propre à cette intégration. Ne partagez pas ces valeurs.

Enregistrez la configuration et vérifiez le statut. Le bouton de test vérifie
REST seulement ; le statut courant confirme aussi le WebSocket. La découverte
propose les canaux pris en charge : créez les canaux souhaités et attribuez leurs
pièces. Un actionneur multicanal peut produire plusieurs entrées. L’intégration
ne crée ni ne supprime automatiquement les appareils de l’utilisateur.

Les canaux de même nom sur un appareil reçoivent leur adresse API dans la
découverte, par exemple `Double bouton [ch0000]` et `[ch0003]`. Ce n’est pas une
indication haut/bas : REST ne fournit pas cette correspondance physique et une
bascule peut émettre plusieurs actions sur un seul canal. Les appareils déjà
créés gardent leur nom ; vous pouvez les renommer dans Gladys.

## Commandes et boutons

Position et ouverture des lamelles : **0 % fermé, 100 % ouvert**. Les lamelles
ne sont proposées qu’avec les points correspondants, sous forme d’un curseur
distinct en pourcentage, pas en degrés calibrés. Montée/descente/arrêt utilisent
les retours de l’actionneur ; la position peut n’arriver qu’en fin de course.
L’arrêt lit d’abord le mouvement : au repos il ne fait rien, un état inconnu est
refusé. Le point ABB sert aussi à avancer d’un pas : un arrêt autonome entre
lecture et écriture reste une course non atomique du protocole. Une luminosité
de zéro utilise la commande d’extinction séparée.

Créez d’abord le canal bouton, puis choisissez **Intégrations → free@home → Action
d’un bouton** dans l’éditeur de scènes. Le bouton est obligatoire ; une action
vide signifie toutes ses actions. Selon sa configuration : allumer/éteindre,
variation haut/bas/arrêt, ouvrir/fermer et arrêt/pas haut ou bas. Deux télégrammes
identiques en direct restent deux événements. Le dernier état affiché ne doit
pas servir de déclencheur de pression. Il ne s’agit pas d’une API universelle
pression/relâchement ou double-clic. Les instantanés et la synchronisation initiale
ne déclenchent rien ; les événements pendant une coupure sont perdus, non rejoués.

## Sécurité et état du développement

Préférez HTTPS avec un certificat approuvé ; utilisez `NODE_EXTRA_CA_CERTS` pour
une autorité privée sans désactiver TLS. HTTP Basic ne chiffre pas les données.
N’exposez jamais l’API sur Internet. Les commandes ne sont jamais répétées
automatiquement, même après reconnexion : un accusé perdu ne prouve pas l’échec.

En plus des tests synthétiques, des essais matériels expressément autorisés sur
le firmware 3.5.3 ont vérifié l’éclairage commuté, le positionnement d’un volet,
montée/arrêt, les événements de bouton identiques répétés et le redémarrage/la
reconnexion. Variation, lamelles, autre côté du bouton et commande de descente
séparée restent à tester sur matériel réel. Groupes, appareils virtuels, scènes
free@home, chauffage et autres capteurs sont hors périmètre. Code source public,
sans image publiée, version publiée ni fiche Store.

## Fonctionnement et mises à jour

Utilisez la supervision Gladys pour démarrer/arrêter, redémarrer, consulter les
journaux et mettre à jour. L’hôte Gladys/Docker doit fonctionner, pas l’ordinateur
du développeur. Utilisez la mise à jour plutôt qu’une désinstallation : dans
Gladys, désinstaller supprime aussi l’inscription, la configuration et les
appareils. L’image ne contient aucun identifiant personnel. La configuration
vient de Gladys ; aucun fichier persistant local n’est nécessaire.
