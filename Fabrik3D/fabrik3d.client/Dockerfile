FROM node:22-alpine AS build
WORKDIR /workspace

COPY fabrik3d.client/package.json fabrik3d.client/package-lock.json ./fabrik3d.client/
RUN cd fabrik3d.client && npm ci

COPY fabrik3d.client ./fabrik3d.client
COPY fabrik3d-ts-contracts ./fabrik3d-ts-contracts
WORKDIR /workspace/fabrik3d.client
RUN npm run build

FROM nginx:1.27-alpine AS final
COPY fabrik3d.client/nginx.production.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/fabrik3d.client/dist /usr/share/nginx/html
EXPOSE 80
