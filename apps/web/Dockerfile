FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build -w packages/shared
# NEXT_PUBLIC_* 값은 next build 시점에 클라이언트 번들에 그대로 박히므로 런타임 환경변수로는
# 바꿀 수 없다. 기본값을 빈 문자열(= 같은 오리진의 상대경로)로 둬서 Caddy가 /api/*를 api로
# 프록시하는 docker-compose 구성에서 바로 동작하게 한다. 다른 도메인의 API를 쓰려면
# `docker compose build --build-arg NEXT_PUBLIC_API_URL=https://api.example.com web`으로 재정의.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build -w apps/web

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
