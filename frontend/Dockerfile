FROM node:24-bookworm-slim AS build
WORKDIR /app

RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# 빌드된 화면만 Nginx에 넣어 실행한다. Node는 빌드 단계에서만 사용한다.
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
