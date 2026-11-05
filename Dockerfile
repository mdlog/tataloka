# Tataloka container: one Node process serving the API and the built app.
# Node ≥ 22.13 is required for the built-in SQLite (node:sqlite).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build

FROM node:24-slim
WORKDIR /app
# Accounts, designs, renders and credits live in SQLite on the persistent volume.
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src ./src
COPY public ./public
COPY scripts ./scripts
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
