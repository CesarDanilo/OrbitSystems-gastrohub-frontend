# syntax=docker/dockerfile:1
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=secret,id=npm_token,env=NODE_AUTH_TOKEN \
  echo "//npm.pkg.github.com/:_authToken=$NODE_AUTH_TOKEN" > /root/.npmrc \
  && pnpm install --frozen-lockfile && rm /root/.npmrc
COPY . .
RUN pnpm exec vite build

FROM nginx:1.29-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
