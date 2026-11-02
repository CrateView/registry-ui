FROM node:24.22.2-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --ignore-scripts
COPY . .
RUN node scripts/patch-import-x.mjs && npx nuxt prepare && npm run build

FROM node:24.22.2-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.output ./.output
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
