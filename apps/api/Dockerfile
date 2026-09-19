FROM node:22-alpine AS build
WORKDIR /workspace
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
RUN npm install
RUN npm run build:api

FROM node:22-alpine
WORKDIR /workspace
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/packages ./packages
CMD ["node", "apps/api/dist/main.js"]
