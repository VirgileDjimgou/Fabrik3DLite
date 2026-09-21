FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ["Fabrik3D.Server/Fabrik3D.ServerTaskManager.csproj", "Fabrik3D.Server/"]
COPY ["Fabrik3D.Contracts/Fabrik3D.Contracts.csproj", "Fabrik3D.Contracts/"]
COPY ["Fabrik3D.Domain/Fabrik3D.Domain.csproj", "Fabrik3D.Domain/"]
COPY ["Fabrik3D.Infrastructure/Fabrik3D.Infrastructure.csproj", "Fabrik3D.Infrastructure/"]
RUN dotnet restore "Fabrik3D.Server/Fabrik3D.ServerTaskManager.csproj"

COPY . .
RUN dotnet publish "Fabrik3D.Server/Fabrik3D.ServerTaskManager.csproj" \
    --configuration Release \
    --output /app/publish \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "Fabrik3D.ServerTaskManager.dll"]
