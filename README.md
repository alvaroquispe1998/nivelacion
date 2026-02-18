# UAI - Horario y Asistencia (Nx + NestJS + Angular) - Dev 100% Docker

Monorepo Nx:
- `apps/api`: NestJS + JWT + TypeORM + MySQL + Swagger
- `apps/web`: Angular + Tailwind
- `libs/shared`: enums y types compartidos (solo TS)

## Levantar en desarrollo (Docker)

1. Iniciar servicios:

```sh
docker compose -f docker-compose.dev.yml up --build -d
```

2. Ejecutar migraciones (manual, opcional):

```sh
docker compose -f docker-compose.dev.yml exec -T api pnpm nx run api:migrate
```

## Migraciones de base de datos

### Docker (recomendado)

- El servicio `api` arranca con `DB_RUN_MIGRATIONS=true`, por lo que las migraciones se ejecutan automaticamente al iniciar el backend.
- Si quieres forzar ejecucion manual:

```sh
docker compose -f docker-compose.dev.yml exec -T api pnpm nx run api:migrate
```

### Local (sin Docker)

1. Configura variables DB en tu entorno:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_USER`
   - `DB_PASS`
   - `DB_NAME`
2. Ejecuta:

```sh
npx nx run api:migrate
```

## URLs (host)

- Web: `http://localhost:4201`
- API base: `http://localhost:3333/api`
- Swagger: `http://localhost:3333/docs`
- Adminer: `http://localhost:8080`

MySQL (desde Adminer o cliente):
- Host: `mysql`
- Puerto: `3306`
- DB: `uai`
- User: `uai`
- Pass: `uai_pass`

## Credenciales iniciales

- ADMIN:
  - Usuario: `administrador`
  - Password: `Admin@UAI19`

## Reglas de login

- Campo `usuario`:
  - ALUMNO: `codigoAlumno`
  - DOCENTE: `dni`
  - ADMIN: `administrador`
- Campo `password`:
  - ALUMNO: su `dni`
  - DOCENTE: su `dni`
  - ADMIN: `Admin@UAI19`

## Comandos utiles

- Migrar DB: `npx nx run api:migrate`
- Build API: `npx nx run api:build --configuration=development`
- Build Web: `npx nx run web:build --configuration=development`

## Notas Docker/Nx

- `apps/web` usa proxy del dev-server: todas las llamadas van a `/api/...` (sin CORS).
- `.nx` se aisla por contenedor via volumenes (`nx_api`, `nx_web`, `nx_deps`) para evitar locks compartidos.
- El repo incluye tipos fallback en `types/` para evitar errores de IntelliSense cuando VSCode abre el proyecto sin `node_modules` local.

## VSCode recomendado

- Si quieres evitar por completo errores de tipos/modulos en host, abre el proyecto con Dev Containers.
- Archivo incluido: `.devcontainer/devcontainer.json`.
- En VSCode: `Dev Containers: Reopen in Container`.
