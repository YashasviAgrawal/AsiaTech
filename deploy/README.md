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

Everything lives in two Docker volumes: `asiatech_db` (Postgres) and `asiatech_uploads` (guest IDs, bills, photos; empty when `STORAGE_DRIVER=s3`).

```bash
# Nightly database dump (add to cron); keep copies off the server
docker compose exec -T db pg_dump -U postgres -Fc hotel_os > backup-$(date +%F).dump

# Restore into an empty database
docker compose exec -T db pg_restore -U postgres -d hotel_os --clean --if-exists < backup-2026-11-26.dump
```

## Day to day

| Task | Command |
|------|---------|
| Status | `docker compose ps` |
| Logs | `docker compose logs -f app worker` |
| Restart | `docker compose restart app worker` |
| Stop (data kept) | `docker compose down` |
| Database shell | `docker compose exec db psql -U postgres hotel_os` |

## Providers

Out of the box nothing leaves the server: WhatsApp messages and emails are written to the logs, payment links open a demo page, and OTAs are simulated. Switch each one in `deploy/.env` when the hotel's accounts are ready (`WHATSAPP_PROVIDER`, `PAYMENTS_PROVIDER` + Razorpay keys, `CHANNEL_PROVIDER` + Channex key, `EMAIL_PROVIDER=smtp` + `SMTP_URL`, `STORAGE_DRIVER=s3`), then `docker compose up -d`.

## Building behind a TLS-inspecting proxy

If `npm ci` fails during the build with certificate errors, give the build your proxy's CA certificate:

```bash
docker build --secret id=npm_ca,src=/path/to/proxy-ca.crt --target app -t asiatech-app ..
docker build --secret id=npm_ca,src=/path/to/proxy-ca.crt --target tools -t asiatech-tools ..
docker compose up -d
```
