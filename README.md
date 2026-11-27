# erp-CSCB
Mise en place d'un emploi du temps collaboratif pour le personnel d'un centre social et culturel

## Comptes de démo (dev)
La base ne contient au départ que l'admin de la configuration. Pour ajouter les 10 comptes de démo (admin + 9 employés,
avec leurs semaines type), une fois le back démarré :
```
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/comptes-demo.sql
```
Le script est idempotent : il peut être relancé sans risque.

## Démo depuis internet (tunnel temporaire)

Pour faire tester l'application à distance, sans déploiement : un tunnel Cloudflare expose ton poste
via une URL `https://xxx.trycloudflare.com` (gratuit, sans compte).

1. Installer `cloudflared` (une fois) :
   ```bash
   mkdir -p ~/.local/bin
   curl -fsSL -o ~/.local/bin/cloudflared \
     https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
   chmod +x ~/.local/bin/cloudflared
   ```
2. Arrêter un éventuel `npm start` sur le port 4200, puis lancer :
   ```bash
   ./scripts/demo-tunnel.sh
   ```
   Le script démarre l'infra, le back en profil dev (ou réutilise celui déjà lancé sur 8080), le front en
   configuration `tunnel`, puis affiche l'URL publique à envoyer au testeur. `Ctrl+C` arrête tout.

⚠️ Le login est **simulé** (profil dev) : toute personne qui a l'URL peut se connecter, y compris en admin.
À réserver à des sessions de test courtes avec des données fictives. L'URL change à chaque lancement et ton
poste doit rester allumé pendant le test.
