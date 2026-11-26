# syntax=docker/dockerfile:1
#
# AsiaTech Hotel OS. Two images from one file (see deploy/compose.yaml):
#   app    the web app: Next.js standalone server, only the files it uses
#   tools  database migrations, the demo seed, first-hotel setup and the background worker
#
#   docker build --target app   -t asiatech-app .
#   docker build --target tools -t asiatech-tools .

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Behind a TLS-inspecting proxy, pass its CA: docker build --secret id=npm_ca,src=/path/to/ca.crt …
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -s /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# Shown in the browser tab and the sidebar. Fixed at build time (Next.js inlines NEXT_PUBLIC_ values);
# the public address is not: set APP_URL when the container starts.
ARG NEXT_PUBLIC_APP_NAME=AsiaTech
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME} NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN npm run build

FROM ${NODE_IMAGE} AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown node:node /data/uploads
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]

# Runtime packages only (tsx runs the TypeScript scripts directly), copied into a clean image below.
FROM deps AS prod-deps
RUN npm prune --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS tools
WORKDIR /app
ENV NODE_ENV=production STORAGE_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown node:node /data/uploads
COPY --from=prod-deps /app/node_modules ./node_modules
COPY . .
USER node
# Default: the background worker. Others: npm run db:migrate · npm run db:seed · npm run create-hotel -- --help
CMD ["npm", "run", "worker"]
