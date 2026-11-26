# Running AsiaTech Hotel OS on a server

One server with Docker runs everything: Postgres, the web app and the background worker. A small VPS (2 vCPU, 4 GB RAM) is plenty for one hotel; a PC in the hotel office works too.

## 1. First start

```bash
git clone <this repository> asiatech && cd asiatech/deploy
cp .env.example .env
```

Open `deploy/.env` and fill in the four secrets. Make each one with `openssl rand -hex 32`:

| Setting | What it is |
|---------|------------|
| `POSTGRES_PASSWORD` | Database superuser (only the database container uses it) |
| `APP_DB_PASSWORD` | The app's own database login, `hotel`. It is not a superuser, so row-level security always applies |
| `AUTH_SECRET` | Signs sign-in cookies and guest invoice links |
| `CREDENTIALS_KEY` | Encrypts OTA tokens and API keys saved in the database |

Set `APP_URL` to the address people will open (for example `https://pms.yourhotel.com`). Then:

```bash
docker compose up -d --build
```

Migrations run first (the `migrate` container exits with code 0), then `app` and `worker` start. `docker compose ps` shows `app` as **healthy** once it answers on `/api/health`.

## 2. Create the hotel and its owner

```bash
docker compose run --rm tools npm run create-hotel -- --hotel "Hotel Sunrise" --owner "Asha Mehta" --email asha@sunrise.in --mobile 9829055555 --city Udaipur
```

It prints the sign-in address, the login and a first password (shown once). The owner signs in and Home shows **Finish setting up**: hotel details, rooms, rates, OTA connection, then Go live. Run `create-hotel -- --help` for all options (another hotel for the same owner, an existing organisation, `--platform-admin` for your own team's login).

Just trying it out? Load the demo hotel instead: `docker compose run --rm tools npm run db:seed` (sign in with `owner@shriramportico.in` / `Hotel@123`).

## 3. HTTPS

Put a reverse proxy with a certificate in front of port `APP_PORT`. With [Caddy](https://caddyserver.com) that is two lines in a `Caddyfile`:

```
pms.yourhotel.com {
  reverse_proxy localhost:3000
}
```

With `APP_URL` on `https://`, sign-in cookies are marked Secure. A hotel-only install on the office network (`APP_URL=http://192.168.1.20:3000`) works without HTTPS.

## 4. Updates

```bash
git pull
docker compose up -d --build
```

New migrations apply on start, and the built-in roles pick up any new permissions. Staff stay signed in.

## 5. Backups

The worker backs up every night at 03:00 (India time) into the `asiatech_backups` volume, and keeps 14 days. Each backup is a dump of the whole database (every hotel) and, with local storage, an archive of the uploads (guest IDs, bills, photos). The first one is made as soon as the worker starts.

See them in the **platform console → Backups**: when the last good backup was made, its size, any failure, **Back up now**, and a **Download** link for each file still on the server. A red dot on the tab means no good backup since last night.

**Keep a copy off this server.** A backup on the same disk does not survive a dead disk or a lost VPS. Either download one regularly from the console, or let the worker copy every backup to a private S3 / R2 bucket: set `BACKUP_S3_BUCKET` plus the `S3_*` settings in `deploy/.env`, then `docker compose up -d`. The bucket keeps every copy; add a lifecycle rule there (for example "delete after 90 days").

| Setting | Default | |
|---------|---------|--|
| `BACKUP_HOUR` | `3` | Hour of the night it starts (India time) |
| `BACKUP_KEEP_DAYS` | `14` | Days kept on this server. The newest backup is never deleted |
| `BACKUP_S3_BUCKET` | | Off-site copies under `backups/` in this bucket |

A backup right now, from the command line: `docker compose exec worker npm run backup`

### Restore

Restoring replaces **everything** in the database, for every hotel, with the backup.

```bash
# 1. Copy the backup out of the volume (or use a file downloaded from the console)
docker compose cp worker:/data/backups/hotel_os-2026-11-26-0300.dump .

# 2. Stop the app and the worker, restore the database, start again
docker compose stop app worker
docker compose exec -T db pg_restore -U postgres -d hotel_os --clean --if-exists --single-transaction < hotel_os-2026-11-26-0300.dump
docker compose start app worker
```

Uploads, if the photos and ID copies are lost too: `docker compose cp worker:/data/backups/uploads-2026-11-26-0300.tar.gz .`, then

```bash
docker compose run --rm -T --user root --entrypoint sh -v "$PWD:/restore:ro" tools -c 'tar -xzf /restore/uploads-2026-11-26-0300.tar.gz -C /data/uploads && chown -R node:node /data/uploads'
```

On a **new server**: do step 1 of this guide (`docker compose up -d`, which creates the empty database and its roles), then restore as above.

Try a restore once on a spare machine, so you know it works before you need it.

## Day to day

| Task | Command |
|------|---------|
| Status | `docker compose ps` |
| Logs | `docker compose logs -f app worker` |
| Restart | `docker compose restart app worker` |
| Stop (data kept) | `docker compose down` |
| Database shell | `docker compose exec db psql -U postgres hotel_os` |
| Backup now | `docker compose exec worker npm run backup` |

## Providers

Out of the box nothing leaves the server: WhatsApp messages and emails are written to the logs, payment links open a demo page, and OTAs are simulated. Switch each one in `deploy/.env` when the hotel's accounts are ready (`WHATSAPP_PROVIDER`, `PAYMENTS_PROVIDER` + Razorpay keys, `CHANNEL_PROVIDER` + Channex key, `EMAIL_PROVIDER=smtp` + `SMTP_URL`, `STORAGE_DRIVER=s3`), then `docker compose up -d`.

## Building behind a TLS-inspecting proxy

If `npm ci` fails during the build with certificate errors, give the build your proxy's CA certificate:

```bash
docker build --secret id=npm_ca,src=/path/to/proxy-ca.crt --target app -t asiatech-app ..
docker build --secret id=npm_ca,src=/path/to/proxy-ca.crt --target tools -t asiatech-tools ..
docker compose up -d
```
