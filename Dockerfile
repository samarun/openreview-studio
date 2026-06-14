FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
RUN pnpm -r build

ENV NODE_ENV=production

CMD ["pnpm", "--filter", "@openreview/web", "start"]
