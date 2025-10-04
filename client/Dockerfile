# ---------- Angular DEV Dockerfile ----------
FROM node:22-alpine
WORKDIR /app

# Enable pnpm through corepack
RUN corepack enable

# Install deps (uses lockfile for repeatable builds)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Expose Angular dev server port
EXPOSE 4200

# ng serve (bind to 0.0.0.0 so Docker can expose it)
CMD ["pnpm", "exec", "ng", "serve", "--host", "0.0.0.0", "--port", "4200"]
