FROM node:22-alpine
WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable

# Install deps first for better layer caching
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

# Copy the rest (source, tsconfig, etc.)
COPY . .

# Expose the Nest port (compose maps 8080:8080)
EXPOSE 8080

# `pnpm run start:dev` for testing
CMD ["pnpm", "run", "start:dev"]

# for production
# CMD ["pnpm", "run", "start:prod"]
