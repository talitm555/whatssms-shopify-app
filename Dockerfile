# Build: full install for Remix/Vite + Prisma
FROM node:22-bookworm-slim AS builder

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
COPY . .

RUN npx prisma generate
RUN npm run build

# Run: production deps + Remix build + Prisma schema; `app/` + `scripts/` for optional `job-worker` (tsx)
FROM node:22-bookworm-slim AS runner

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3150

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma
COPY --from=builder /app/build ./build
COPY --from=builder /app/app ./app
COPY --from=builder /app/scripts ./scripts

RUN npx prisma generate

EXPOSE 3150

CMD ["npm", "run", "docker-start"]
