FROM node:22-alpine AS build
WORKDIR /workspace
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json ./
RUN npm install
RUN npm run build:web

FROM nginx:1.27-alpine
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 80
