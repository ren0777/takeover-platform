FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.32.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps
COPY tsconfig.json eslint.config.mjs ./
RUN pnpm install --frozen-lockfile
RUN DATABASE_URL=postgresql://build:build@localhost/build pnpm db:generate
ARG TAKEOVER_API_ORIGIN=http://api:4000
ARG NEXT_PUBLIC_SITE_URL=https://takeover.example
ENV TAKEOVER_API_ORIGIN=$TAKEOVER_API_ORIGIN
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV TAKEOVER_LIVE_RESOURCES=all
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
RUN chown -R node:node /app/apps/web/.next

FROM build AS api
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4000
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]

FROM build AS web
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@takeover/web", "start", "--hostname", "0.0.0.0"]
