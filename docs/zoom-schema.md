# Zoom Management – Esquema de Base de Datos

Migración: `039-zoom-management`

---

## Tabla `zoom_config`

Almacena la configuración global de credenciales y parámetros de Zoom (una sola fila).

| Columna          | Tipo            | Nullable | Default          | Descripción                                    |
| ---------------- | --------------- | -------- | ---------------- | ---------------------------------------------- |
| `id`             | INT             | NO       | AUTO_INCREMENT   | PK                                             |
| `account_id`     | VARCHAR(255)    | SÍ       | NULL             | Zoom Account ID (Server-to-Server OAuth)       |
| `client_id`      | VARCHAR(255)    | SÍ       | NULL             | Zoom Client ID                                 |
| `client_secret`  | VARCHAR(512)    | SÍ       | NULL             | Zoom Client Secret (almacenado cifrado o plano)|
| `max_concurrent` | INT             | NO       | 2                | Máximo de reuniones simultáneas por host        |
| `page_size`      | INT             | NO       | 20               | Tamaño de página para consultas a Zoom API     |
| `timezone`       | VARCHAR(100)    | NO       | `America/Lima`   | Timezone por defecto para reuniones             |
| `created_at`     | DATETIME        | NO       | CURRENT_TIMESTAMP| Fecha de creación                               |
| `updated_at`     | DATETIME        | NO       | CURRENT_TIMESTAMP ON UPDATE | Fecha de última actualización       |

**Índices:** PK(`id`)

---

## Tabla `zoom_host_groups`

Grupos lógicos para organizar los hosts de Zoom (ej: PREGRADO, POSGRADO, NIVELACIÓN).

| Columna      | Tipo                        | Nullable | Default          | Descripción                  |
| ------------ | --------------------------- | -------- | ---------------- | ---------------------------- |
| `id`         | INT                         | NO       | AUTO_INCREMENT   | PK                           |
| `name`       | VARCHAR(100)                | NO       | —                | Nombre del grupo             |
| `status`     | ENUM('ACTIVO', 'INACTIVO')  | NO       | `ACTIVO`         | Estado del grupo             |
| `created_at` | DATETIME                    | NO       | CURRENT_TIMESTAMP| Fecha de creación            |
| `updated_at` | DATETIME                    | NO       | CURRENT_TIMESTAMP ON UPDATE | Última actualización |

**Índices:** PK(`id`), UNIQUE(`name`)

---

## Tabla `zoom_hosts`

Correos electrónicos de hosts de Zoom, asociados a un grupo.

| Columna      | Tipo                        | Nullable | Default          | Descripción                          |
| ------------ | --------------------------- | -------- | ---------------- | ------------------------------------ |
| `id`         | INT                         | NO       | AUTO_INCREMENT   | PK                                   |
| `group_id`   | INT                         | NO       | —                | FK → `zoom_host_groups(id)` CASCADE  |
| `email`      | VARCHAR(255)                | NO       | —                | Email del host en Zoom               |
| `status`     | ENUM('ACTIVO', 'INACTIVO')  | NO       | `ACTIVO`         | Estado del host                      |
| `created_at` | DATETIME                    | NO       | CURRENT_TIMESTAMP| Fecha de creación                    |
| `updated_at` | DATETIME                    | NO       | CURRENT_TIMESTAMP ON UPDATE | Última actualización         |

**Índices:** PK(`id`), UNIQUE(`email`)  
**FK:** `group_id` → `zoom_host_groups(id)` ON DELETE CASCADE

---

## Tabla `zoom_meetings`

Registro de reuniones creadas a través de la API. Permite trazabilidad y control de estado.

| Columna           | Tipo                                             | Nullable | Default          | Descripción                                 |
| ----------------- | ------------------------------------------------ | -------- | ---------------- | ------------------------------------------- |
| `id`              | INT                                              | NO       | AUTO_INCREMENT   | PK                                          |
| `period_id`       | INT                                              | SÍ       | NULL             | FK → `periods(id)` SET NULL — periodo asociado |
| `host_email`      | VARCHAR(255)                                     | NO       | —                | Email del host asignado                     |
| `zoom_meeting_id` | BIGINT                                           | NO       | —                | ID de la reunión en Zoom                    |
| `topic`           | VARCHAR(500)                                     | NO       | —                | Tema/título de la reunión                   |
| `agenda`          | TEXT                                             | SÍ       | NULL             | Descripción/agenda                          |
| `start_time`      | DATETIME                                         | NO       | —                | Fecha y hora de inicio (UTC)                |
| `end_time`        | DATETIME                                         | SÍ       | NULL             | Fecha y hora de fin (UTC)                   |
| `duration`        | INT                                              | NO       | —                | Duración en minutos                         |
| `timezone`        | VARCHAR(100)                                     | SÍ       | NULL             | Timezone original de la solicitud           |
| `join_url`        | VARCHAR(1000)                                    | SÍ       | NULL             | URL para participantes                      |
| `start_url`       | TEXT                                             | SÍ       | NULL             | URL de inicio para el host                  |
| `status`          | ENUM('SCHEDULED','LIVE','ENDED','DELETED')       | NO       | `SCHEDULED`      | Estado de la reunión                        |
| `created_at`      | DATETIME                                         | NO       | CURRENT_TIMESTAMP| Fecha de creación del registro              |
| `updated_at`      | DATETIME                                         | NO       | CURRENT_TIMESTAMP ON UPDATE | Última actualización del registro |

**Índices:** PK(`id`), INDEX(`zoom_meeting_id`), INDEX(`host_email`), INDEX(`period_id`)  
**FK:** `period_id` → `periods(id)` ON DELETE SET NULL

---

## Diagrama de Relaciones

```
zoom_config (1 fila global)

zoom_host_groups  1 ──< N  zoom_hosts
       │                        │
       └── name (UNIQUE)        └── email (UNIQUE)
                                     group_id FK → zoom_host_groups(id) CASCADE

periods  1 ──< N  zoom_meetings
                    │
                    └── period_id FK → periods(id) SET NULL
                        zoom_meeting_id (Zoom API ID)
```

---

## Endpoints API

| Método | Ruta                                       | Descripción                          |
| ------ | ------------------------------------------ | ------------------------------------ |
| GET    | `/api/admin/zoom/config`                   | Obtener configuración (secret enmascarado) |
| PUT    | `/api/admin/zoom/config`                   | Guardar/actualizar configuración     |
| GET    | `/api/admin/zoom/config/test`              | Probar conexión con Zoom API         |
| GET    | `/api/admin/zoom/config/host-groups`       | Listar grupos de hosts               |
| POST   | `/api/admin/zoom/config/host-groups`       | Crear grupo de hosts                 |
| PATCH  | `/api/admin/zoom/config/host-groups/:id`   | Actualizar grupo (nombre/status)     |
| DELETE | `/api/admin/zoom/config/host-groups/:id`   | Eliminar grupo y sus hosts           |
| POST   | `/api/admin/zoom/config/host-groups/:groupId/hosts` | Agregar host a grupo        |
| PATCH  | `/api/admin/zoom/config/hosts/:id`         | Actualizar host (email/status)       |
| DELETE | `/api/admin/zoom/config/hosts/:id`         | Eliminar host                        |
| POST   | `/api/admin/zoom/meetings/auto`            | Crear reunión automática             |
| GET    | `/api/admin/zoom/meetings`                 | Listar reuniones (con filtros)       |
| GET    | `/api/admin/zoom/meetings/by-topic`        | Buscar reuniones por tema            |
| GET    | `/api/admin/zoom/meetings/recordings`      | Listar grabaciones                   |
| GET    | `/api/admin/zoom/meetings/users/licensed`  | Listar usuarios con licencia Zoom    |
| DELETE | `/api/admin/zoom/meetings/:id`             | Eliminar reunión                     |
