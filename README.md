# UAI - Horario y Asistencia (Nx + NestJS + Angular) - Dev 100% Docker

Monorepo Nx:
- `apps/api`: NestJS + JWT + TypeORM + MySQL + Swagger
- `apps/web`: Angular + Tailwind
- `libs/shared`: enums y types compartidos (solo TS)

## Levantar en desarrollo (Docker)

1. Iniciar servicios:

```sh
docker compose -f docker-compose.dev.yml up -d --build
```

2. Cargar datos demo (seeds):

```sh
docker compose -f docker-compose.dev.yml exec -T api pnpm nx run api:seed
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

## Credenciales demo

- ADMIN: DNI `00000000`, password `admin123`
- ALUMNO: DNI `10000001`, codigoAlumno `A001`

## Notas Docker/Nx

- `apps/web` usa proxy del dev-server: todas las llamadas van a `/api/...` (sin CORS).
- `.nx` se aisla por contenedor via volumenes (`nx_api`, `nx_web`, `nx_deps`) para evitar locks compartidos.
- El repo incluye tipos fallback en `types/` para evitar errores de IntelliSense cuando VSCode abre el proyecto sin `node_modules` local.

## VSCode Recomendado

- Si quieres evitar por completo errores de tipos/modulos en host, abre el proyecto con Dev Containers.
- Archivo incluido: `.devcontainer/devcontainer.json`.
- En VSCode: `Dev Containers: Reopen in Container`.
