FROM node:22-alpine AS build
WORKDIR /workspace

COPY fabrik3d.hmi/package.json fabrik3d.hmi/package-lock.json ./fabrik3d.hmi/
RUN cd fabrik3d.hmi && npm ci

COPY fabrik3d.hmi ./fabrik3d.hmi
COPY fabrik3d-ts-contracts ./fabrik3d-ts-contracts
WORKDIR /workspace/fabrik3d.hmi
RUN npm run build

FROM nginx:1.27-alpine AS final
COPY fabrik3d.hmi/nginx.production.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/fabrik3d.hmi/dist /usr/share/nginx/html
EXPOSE 80
