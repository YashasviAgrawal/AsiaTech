#!/bin/sh
# Runs once, when the database volume is first created. The app connects as `hotel`, a role that is NOT a
# superuser and cannot bypass row-level security, so the per-hotel policies always apply (README → Row-level security).
set -eu
psql -v ON_ERROR_STOP=1 -v pw="$APP_DB_PASSWORD" --username "$POSTGRES_USER" --dbname postgres <<'EOSQL'
CREATE ROLE hotel LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE hotel_os OWNER hotel;
EOSQL
