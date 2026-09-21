FROM node:22-bookworm-slim AS web-build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS admin-build
WORKDIR /src
COPY backend/AccountAdmin/AccountAdmin.csproj backend/AccountAdmin/
RUN dotnet restore backend/AccountAdmin/AccountAdmin.csproj
COPY backend/AccountAdmin/ backend/AccountAdmin/
RUN dotnet publish backend/AccountAdmin/AccountAdmin.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app/web
COPY --from=web-build /usr/local/bin/node /usr/local/bin/node
COPY --from=web-build /src /app/web
COPY --from=admin-build /out /app/admin
ENV NODE_ENV=production \
    ASPNETCORE_ENVIRONMENT=Production \
    ADMIN_DATA_DIR=/var/lib/jshen \
    ADMIN_URLS=http://0.0.0.0:5092 \
    ACCOUNT_ADMIN_URL=http://127.0.0.1:5092
EXPOSE 10000 5092
ENTRYPOINT ["node", "/app/web/scripts/start-combined.mjs"]
