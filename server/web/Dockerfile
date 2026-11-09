FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates-muse/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint-muse.sh
RUN chmod +x /docker-entrypoint-muse.sh
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod -R a+rX /usr/share/nginx/html
ENTRYPOINT ["/docker-entrypoint-muse.sh"]
EXPOSE 8080
