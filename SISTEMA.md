# 📘 Documentación del Sistema: UAI Nivelación

> **Sistema Integral de Gestión Académica para Cursos de Nivelación**
> Universidad Autónoma de Ica (UAI)

---

## 1. Descripción General

El sistema **UAI Nivelación** es una plataforma web integral diseñada para gestionar el ciclo completo de los cursos de nivelación universitaria. Abarca desde la planificación inicial de la demanda estudiantil hasta la gestión de notas y asistencia, pasando por la creación automatizada de secciones, la asignación de horarios, docentes y aulas, y la ejecución de matrícula.

### Propósito
- Centralizar y automatizar la gestión académica de los cursos de nivelación.
- Reducir la intervención manual en la distribución de alumnos y la creación de secciones.
- Garantizar coherencia entre la planificación y la infraestructura física (aulas).
- Ofrecer herramientas de seguimiento en tiempo real (asistencia, notas, horarios).

### Cursos gestionados
El sistema está preparado para gestionar los siguientes cursos de nivelación (detección dinámica desde Excel):
- **COMUNICACIÓN**
- **HABILIDADES COMUNICATIVAS**
- **MATEMÁTICA**
- **CIENCIA, TECNOLOGÍA Y AMBIENTE**
- **CIENCIAS SOCIALES**
- Cursos adicionales configurables (e.g., curso de Bienvenida/Welcome)

---

## 2. Arquitectura Técnica

### 2.1 Monorepo con Nx

```
nivelacion/
├── apps/
│   ├── api/          → Backend NestJS (API REST + Swagger)
│   ├── api-e2e/      → Tests end-to-end del API
│   └── web/          → Frontend Angular (SPA)
├── libs/
│   └── shared/       → Tipos, interfaces y enumeraciones compartidas
├── docs/             → Documentación adicional del sistema
├── docker-compose.dev.yml
└── package.json
```

### 2.2 Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Orquestador** | Nx Monorepo | 22.5.1 |
| **Backend** | NestJS (Node.js) | 11.x |
| **Frontend** | Angular | 21.x |
| **ORM** | TypeORM | 0.3.28 |
| **Base de Datos** | MySQL | 8.0 |
| **Autenticación** | JWT + Passport | - |
| **Hashing** | bcrypt | 6.x |
| **Procesamiento Excel** | xlsx (SheetJS) | 0.18.5 |
| **Generación PDF** | PDFKit | 0.17.2 |
| **Estilos** | Tailwind CSS | 3.x |
| **Infraestructura** | Docker + Docker Compose | - |
| **Documentación API** | Swagger (OpenAPI) | - |
| **HTTP Client** | Axios (integraciones) | 1.6.x |

### 2.3 Infraestructura Docker

El entorno de desarrollo se levanta con `docker-compose.dev.yml` y consta de:

| Servicio | Puerto Local | Descripción |
|----------|-------------|-------------|
| `mysql` | 3307 | Base de datos MySQL 8.0 |
| `api` | 3333 → 3000 | Backend NestJS |
| `web` | 4201 → 4200 | Frontend Angular (dev server) |
| `adminer` | 8080 | Gestor visual de base de datos |

### 2.4 Variables de Entorno

```env
DB_HOST=mysql
DB_PORT=3306
DB_USER=uai
DB_PASS=uai_pass
DB_NAME=uai
DB_RUN_MIGRATIONS=true
JWT_SECRET=dev_jwt_secret_change_me
JWT_EXPIRES_IN=8h
AKADEMIC_MODE=mock|real
AKADEMIC_COOKIE=<cookie_session>      # Solo en modo real
AKADEMIC_SECCIONES_URL=<url>          # Solo en modo real
```

---

## 3. Modelo de Datos (Entidades)

> Documentación detallada en: [`docs/modelo-de-datos.md`](docs/modelo-de-datos.md)

### 3.1 Diagrama de Relación de Entidades

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   periods    │     │     sections     │     │  schedule_blocks  │
│  (Periodos)  │     │   (Secciones)    │◄────│    (Horarios)     │
└──────┬───────┘     └────────┬─────────┘     └────────┬──────────┘
       │                      │                        │
       │              ┌───────┴─────────┐     ┌────────┴──────────┐
       │              │ section_courses  │     │attendance_sessions│
       └──────────────┤ (Sección-Curso)  │     │   (Sesiones)      │
                      └───────┬─────────┘     └────────┬──────────┘
                              │                        │
              ┌───────────────┼─────────────┐  ┌───────┴──────────┐
              │               │             │  │attendance_records │
  ┌───────────┴───┐  ┌────────┴──────┐     │  │  (Registros)     │
  │section_student│  │section_course │     │  └──────────────────┘
  │   _courses    │  │  _teachers    │     │
  │(Matrícula)    │  │(Docente x SC) │     │
  └───────┬───────┘  └───────────────┘     │
          │                                │
    ┌─────┴──────┐   ┌──────────────┐     │
    │   users    │   │  classrooms  │     │
    │(Usuarios)  │   │   (Aulas)    │─────┘
    └────────────┘   └──────┬───────┘
                            │
    ┌──────────────┐  ┌─────┴──────┐
    │   teachers   │  │ pavilions  │
    │  (Docentes)  │  │(Pabellones)│
    └──────────────┘  └────────────┘

    ┌──────────────────────────────────────┐
    │       leveling_runs                  │
    │  (Corridas de Nivelación)            │
    │                                      │
    │  ┌──────────────────────────────────┐│
    │  │ leveling_run_student_course      ││
    │  │        _demands                  ││
    │  │ (Demandas de matrícula)          ││
    │  └──────────────────────────────────┘│
    └──────────────────────────────────────┘

    ┌──────────────────────────────────────┐
    │ grade_schemes + grade_scheme_        │
    │ components + section_course_grades   │
    │ + section_course_grade_publications  │
    │           (Sistema de Notas)         │
    └──────────────────────────────────────┘
```

### 3.2 Entidades Principales

| Entidad | Tabla | Descripción |
|---------|-------|-------------|
| `PeriodEntity` | `periods` | Periodos académicos (código, nombre, tipo, fechas, estado) |
| `SectionEntity` | `sections` | Secciones agrupadas por facultad/campus/modalidad |
| `UserEntity` | `users` | Usuarios del sistema (alumnos, docentes, admin) |
| `TeacherEntity` | `teachers` | Catálogo de docentes (DNI + nombre completo) |
| `ClassroomEntity` | `classrooms` | Aulas físicas con aforo, tipo y estado |
| `PavilionEntity` | `pavilions` | Pabellones que agrupan aulas |
| `ScheduleBlockEntity` | `schedule_blocks` | Bloques horarios (día, hora inicio/fin, fechas vigencia) |
| `AttendanceSessionEntity` | `attendance_sessions` | Sesiones de asistencia por bloque y fecha |
| `AttendanceRecordEntity` | `attendance_records` | Registro individual de asistencia por alumno |
| `LevelingRunEntity` | `leveling_runs` | Corridas de procesamiento de nivelación |
| `LevelingRunStudentCourseDemandEntity` | `leveling_run_student_course_demands` | Demandas individuales por alumno/curso |
| `SectionCourseTeacherEntity` | `section_course_teachers` | Asignación docente↔sección-curso |

### 3.3 Tablas Intermedias (sin Entity ORM)

| Tabla | Descripción |
|-------|-------------|
| `section_courses` | Relación sección ↔ curso por periodo con aula y capacidad |
| `section_student_courses` | Matrícula alumno ↔ sección-curso |
| `courses` | Catálogo de cursos |
| `careers` | Catálogo de carreras con mapeo facultad |
| `campuses` | Catálogo de sedes |
| `grade_schemes` | Esquemas de calificación por periodo |
| `grade_scheme_components` | Componentes de nota (DIAGNOSTICO, FK1, FK2, PARCIAL) |
| `section_course_grades` | Notas individuales por alumno/componente |
| `section_course_grade_publications` | Estado de publicación de notas |

---

## 4. Módulos del Backend (API)

> Documentación detallada en: [`docs/modulos-api.md`](docs/modulos-api.md)

### 4.1 Listado de Módulos

| Módulo | Ruta API | Responsabilidad |
|--------|----------|-----------------|
| `AuthModule` | `/api/auth/*` | Autenticación y autorización JWT |
| `PeriodsModule` | `/api/admin/periods/*` | CRUD de periodos académicos |
| `LevelingModule` | `/api/admin/leveling/*` | Motor de nivelación (planificación + matrícula) |
| `SectionsModule` | `/api/admin/sections/*` | Gestión de secciones y secciones-curso |
| `ScheduleBlocksModule` | `/api/admin/schedule-blocks/*` | Programación de horarios |
| `ClassroomsModule` | `/api/admin/classrooms/*` | Gestión de aulas y pabellones |
| `TeachersModule` | `/api/admin/teachers/*` | Catálogo de docentes |
| `AttendanceModule` | `/api/admin/attendance/*` | Control de asistencia |
| `GradesModule` | `/api/admin/grades/*` | Sistema de calificaciones |
| `StudentModule` | `/api/student/*` | Portal del alumno |
| `TeacherModule` | `/api/teacher/*` | Portal del docente |
| `IntegrationsModule` | `/api/admin/integrations/*` | Integración con sistema Akademic |
| `UsersModule` | (interno) | Gestión de usuarios |
| `AdminPeriodContextModule` | (middleware) | Contexto de periodo activo para rutas admin |

### 4.2 Controladores

El sistema tiene **16 controladores** que exponen endpoints REST:

```
app.controller.ts                    → Health check
auth.controller.ts                   → Login, /me
periods.controller.ts                → CRUD periodos (admin)
periods-public.controller.ts         → Consulta pública de periodo activo
leveling.controller.ts               → Motor de nivelación completo
sections.controller.ts               → Secciones, filtros, conflictos, reasignación
schedule-blocks.controller.ts        → CRUD bloques horarios
classrooms.controller.ts             → CRUD aulas y pabellones
teachers.controller.ts               → CRUD docentes
attendance.controller.ts             → Sesiones y registros de asistencia
admin-grades.controller.ts           → Notas (admin)
teacher-grades.controller.ts         → Notas (docente)
student-grades.controller.ts         → Notas (alumno)
student.controller.ts                → Horario y asistencia del alumno
teacher.controller.ts                → Horario y asistencia del docente
akademic.controller.ts               → Proxy al sistema Akademic
```

---

## 5. Roles de Usuario y Autenticación

### 5.1 Roles

```typescript
enum Role {
  ALUMNO = 'ALUMNO',
  ADMIN = 'ADMIN',
  DOCENTE = 'DOCENTE',
}
```

### 5.2 Lógica de Login

El sistema implementa un **algoritmo de identificación inteligente** que determina el tipo de usuario según el formato del input:

```
┌──────────────────────────────────────────────────────────────┐
│                    FLUJO DE LOGIN                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Input: "usuario"                                            │
│    │                                                         │
│    ├─── "administrador" ──────► Buscar admin por DNI         │
│    │    Password: hash bcrypt (con migración desde PLAIN:)   │
│    │                                                         │
│    ├─── /^\d{8,15}$/ (numérico) ──► Buscar en paralelo:     │
│    │    ├─ Staff (Docente) por DNI                            │
│    │    └─ Alumno por DNI                                    │
│    │    Password: comparar con DNI del usuario               │
│    │                                                         │
│    └─── /^[a-zA-Z]\d{5,20}$/ ──► Buscar alumno por código   │
│         Password: comparar con DNI del alumno                │
│                                                              │
│  Resultado: JWT con { sub, role, fullName, dni }             │
│  Expiración: 8 horas                                        │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Credenciales

| Rol | Usuario | Contraseña |
|-----|---------|------------|
| **Admin** | `administrador` | `Admin@UAI19` |
| **Docente** | DNI del docente | DNI del docente |
| **Alumno** | Código de alumno O DNI | DNI del alumno |

### 5.4 Seguridad

- **JWT** firmado con `JWT_SECRET`, expiración configurable (`JWT_EXPIRES_IN`).
- **bcrypt** para hash de contraseña del admin (salt rounds: 10).
- **Migración automática** de contraseñas `PLAIN:xxx` a hash bcrypt al primer login exitoso.
- **Guards** de Angular: `authGuard`, `roleGuard`, `workflowStepGuard`.
- **Middleware** `AdminPeriodContextMiddleware` para inyectar el periodo activo en rutas `/admin/*`.

---

## 6. Algoritmos Principales

> Documentación detallada en: [`docs/algoritmos.md`](docs/algoritmos.md)

### 6.1 Motor de Nivelación (`LevelingService`)

El corazón del sistema. Archivo: `leveling.service.ts` (~8,100 líneas).

#### 6.1.1 Pipeline de Procesamiento Excel

```
┌────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  parseExcel()  │────►│buildCourseGroup  │────►│buildSectionsFrom    │
│  Lee y parsea  │     │    Units()       │     │   GroupUnits()      │
│  el archivo    │     │ Calcula grupos   │     │ Crea secciones      │
│  XLSX          │     │ por curso/campus │     │ planificadas        │
└────────────────┘     └──────────────────┘     └─────────┬───────────┘
                                                          │
┌────────────────┐     ┌──────────────────┐     ┌─────────┴───────────┐
│  applyPlan()   │◄────│resequenceSection │◄────│assignRowStudent     │
│  Persiste en   │     │    Codes()       │     │   Courses()         │
│  base de datos │     │ Codifica A-PS-IC │     │ Asigna alumnos a    │
│                │     │ etc.             │     │ secciones por curso  │
└────────────────┘     └──────────────────┘     └─────────────────────┘
```

**Paso 1: Parseo del Excel (`parseExcel`)**
- Lee el archivo XLSX con la librería SheetJS.
- Detecta automáticamente las columnas por encabezado con búsqueda flexible.
- Soporta formato legacy (posiciones fijas) y formato dinámico (detección de headers).
- **Deduplicación por DNI**: conserva la fila con la fecha de examen más reciente.
- Determina elegibilidad para nivelación: `condición=INGRESO && necesitaNivelacion=SI`.
- Extrae los cursos que necesita cada alumno analizando columnas de notas.
- Normaliza datos: campus, modalidad, facultad, nombres, email, sexo.

**Paso 2: Formación de Grupos de Curso (`buildCourseGroupUnits`)**
- Agrupa la demanda por `facultyGroup × campusName × courseName`.
- **Algoritmo de división (Bin Packing)**: divide la demanda en grupos usando capacidad configurable.
  - `splitCourseGroups(demanda, capacidad, modalidad)` → chunks de tamaño equilibrado.
- Soporta **overrides de modalidad**: permite forzar grupos específicos a VIRTUAL o PRESENCIAL.
- Manejo especial del **Curso de Bienvenida** (Welcome): agrupación `BY_SIZE` o `SINGLE_GROUP`.

**Paso 3: Construcción de Secciones (`buildSectionsFromGroupUnits`)**
- Crea secciones presenciales basadas en el máximo de grupos por curso en cada fila.
- Crea una sección virtual por facultad que agrupa todos los cursos virtuales.
- Determina el número de secciones: `max(maxGruposPorCurso, ceil(alumnos/capacidad))`.
- Cada sección recibe un subconjunto de cursos según la distribución de grupos.

**Paso 4: Asignación de Alumnos a Secciones (`assignRowStudentCourses`)**

Este es el **algoritmo más complejo** del sistema. Funciona como un solver de asignación:

```
Algoritmo: Asignación de Alumnos a Secciones por Curso
===============================================================
1. Ordenar cursos por restricción (menor oferta de secciones primero)
   → Los cursos más difíciles de ubicar se asignan primero.

2. Para cada curso (en orden de restricción):
   a. Agrupar alumnos pendientes por carrera (career cohort)
   b. Ordenar cohortes: más grande primero (mantiene compañeros de carrera juntos)
   c. Dentro de cada cohorte, ordenar por DNI (determinismo)
   d. Recorrer alumnos con un cursor de sección (round-robin):
      - Si el alumno ya tiene el curso cubierto → skip
      - Si la sección tiene capacidad → asignar
      - Si no → avanzar cursor a siguiente sección con capacidad
      - Si no hay más capacidad → error (blocked)

3. Verificación final: todos los alumnos tienen todos sus cursos cubiertos.

Características:
- Prioriza mantener alumnos de la misma carrera juntos
- Intenta llenar secciones de forma balanceada
- Cursos con menor oferta se asignan primero para evitar deadlocks
```

**Paso 5: Persistencia (`applyPlan`)**
- Crea `LevelingRun` con hash SHA-256 del archivo fuente.
- Transacción atómica: `users` → `sections` → `section_courses` → `section_student_courses` → `demands`.
- Bulk INSERT con `ON DUPLICATE KEY UPDATE` para idempotencia.

#### 6.1.2 Modo APPEND (Carga Incremental)

Permite agregar nuevos alumnos a una corrida existente:

```
appendDemandsToRun()
├── Registra nuevas demandas (alumno × curso)
├── expandOfferForAppend()
│   ├── Detecta secciones-curso con capacidad libre
│   │   → Asigna pendientes a cupos existentes (reuso de oferta)
│   ├── Si falta capacidad:
│   │   ├── Buscar secciones compatible sin el curso → agregar course
│   │   └── Si no existe sección → crearAutoExpansionSection()
│   └── Conversión a virtual cuando no hay aulas presenciales
└── previewAppendDemandsAndExpansion() → Vista previa sin persistir
```

#### 6.1.3 Matriculación (`matriculateRun`)

Algoritmo de asignación masiva con validación de capacidad física:

```
Algoritmo: Matriculación por Facultad
===============================================================
Input: runId, facultyGroup (opcional), strategy (FULL_REBUILD | INCREMENTAL)

1. Cargar secciones-curso con metadata completa:
   - Capacidad (initialCapacity, maxExtraCapacity)
   - Aula asignada (classroomId, classroomCapacity)
   - Docente asignado (hasTeacher)
   - Bloques horarios (schedule_blocks)

2. Cargar demandas pendientes (demands no asignados)

3. Validación de cobertura:
   - Para cada curso con demanda pendiente:
     → Calcular capacidad operativa (secciones con horario + docente)
     → Presencial: sumar classroomCapacity de aulas asignadas
     → Virtual: capacidad ilimitada
   - Si capacidad < demanda → ERROR con detalle del déficit

4. Construir candidatos por curso:
   - Ordenar candidatos: preferir secciones con misma faculty+campus+modality
   - Virtual primero (capacidad ilimitada)
   - Presencial: capacidad = min(classroomCapacity, initialCapacity + maxExtraCapacity)

5. Para cada demanda (alumno × curso):
   a. Buscar candidatos compatibles (mismo curso)
   b. Verificar NO conflicto de horario con bloques ya asignados al alumno
   c. Verificar capacidad disponible del candidato:
      → Virtual: siempre disponible
      → Presencial con aula: classroomCapacity - assignedCount > 0
      → Presencial sin aula: initialCapacity - assignedCount > 0
   d. Asignar al mejor candidato disponible
   e. Si no hay candidato → agregar a "unassigned" con motivo

6. Bulk INSERT de asignaciones (section_student_courses)

7. Detectar conflictos de horario post-asignación

Output: {
  assignedCount,
  unassigned[],           // Con motivo de no asignación
  summaryBySectionCourse, // Estado final por sección-curso
  conflictsFoundAfterAssign
}
```

### 6.2 Detección de Conflictos de Horario

Utilidad: `time.util.ts` + SQL complejo en `SectionsService` y `LevelingService`.

```typescript
// Algoritmo de superposición temporal
function timesOverlap(startA, endA, startB, endB): boolean {
  return minutesOf(startA) < minutesOf(endB)
      && minutesOf(endA) > minutesOf(startB);
}
```

**Tipos de conflictos detectados:**

| Tipo | Descripción | Validación |
|------|-------------|------------|
| **Horario de Alumno** | Un alumno tiene dos bloques superpuestos en diferentes secciones-curso | SQL JOINs con schedule_blocks |
| **Horario de Docente** | Un docente tiene dos bloques superpuestos en diferentes secciones-curso | Función `assertTeacherScheduleAvailabilityForBlock` |
| **Ocupación de Aula** | Dos secciones-curso usan la misma aula en horario superpuesto | Función `assertClassroomScheduleAvailabilityForBlock` |

La detección considera **rango de fechas de vigencia** del bloque:
```sql
COALESCE(b1.startDate, '1000-01-01') <= COALESCE(b2.endDate, '9999-12-31')
AND COALESCE(b2.startDate, '1000-01-01') <= COALESCE(b1.endDate, '9999-12-31')
```

### 6.3 Reasignación de Alumnos (`reassignStudentSectionCourse`)

Permite mover un alumno de una sección-curso a otra:

```
1. Verificar que alumno está matriculado en la sección-curso origen
2. Buscar opciones de destino (listReassignmentOptions):
   - Misma facultad + campus + curso
   - Calcular capacidad disponible
   - Verificar si crea conflicto de horario
   - Verificar si excede capacidad
3. Ejecutar reasignación:
   - DELETE de section_student_courses (origen)
   - INSERT en section_student_courses (destino)
4. Registrar motivo y responsable del cambio
```

### 6.4 Sistema de Calificaciones (`GradesService`)

#### 6.4.1 Esquema de Notas

```
Componentes por defecto:
┌──────────────┬────────┬────────┬───────┬───────┐
│ Componente   │ Código │  Peso  │  Min  │  Max  │
├──────────────┼────────┼────────┼───────┼───────┤
│ Diagnóstico  │ DIAG   │   0%   │   0   │  20   │
│ FK1          │ FK1    │  30%   │   0   │  20   │
│ FK2          │ FK2    │  30%   │   0   │  20   │
│ Parcial      │ PARCIAL│  40%   │   0   │  20   │
└──────────────┴────────┴────────┴───────┴───────┘

Regla: La suma de pesos (sin diagnóstico) debe ser 100%.
```

#### 6.4.2 Algoritmo de Promedio Final

```typescript
// computeFinalAverage(components, scoresByComponentId)
// Solo componentes con weight > 0 participan del cálculo
const weighted = components.filter(x => x.weight > 0);
const totalWeight = sum(weighted.map(x => x.weight));
const weightedSum = sum(weighted.map(x => score[x.id] * x.weight));
const finalAverage = roundUp(weightedSum / totalWeight);
const approved = finalAverage >= 11;

// roundUpGrade: redondeo hacia arriba (medio punto sube)
```

**Estados de publicación:**
- `DRAFT` → Notas editables
- `LOCKED` → Notas bloqueadas para edición por docente (admin aún puede editar)

#### 6.4.3 Reportes de Notas

El sistema genera tres tipos de reportes administrativos:
1. **Reporte de Alumnos**: Listado filtrable por facultad/campus/carrera
2. **Reporte de Promedios**: Promedio general por alumno (aprobado si ≥ 11)
3. **Reporte de Asistencia**: Matriz de asistencia por fechas cruzada con calificaciones

### 6.5 Control de Asistencia

```
Flujo de Asistencia:
1. Docente crea sesión → createSession(scheduleBlockId, fecha)
   - Validación: fecha = hoy o ayer (ventana de 1 día)
   - Validación: no duplicar sesión para mismo bloque+fecha
2. Docente marca asistencia → updateRecords(sessionId, [{studentId, status}])
   - Status: ASISTIO | FALTO
   - Opciones: notas/observaciones por registro
3. Admin puede ver todas las sesiones y registros
4. Alumno puede consultar su historial de asistencia
```

### 6.6 Planificación de Horarios

```
Algoritmo: Asignación de Horario
1. Validar que no hay superposición en la misma sección
2. Validar disponibilidad del docente (assertTeacherScheduleAvailability)
3. Validar disponibilidad del aula (assertClassroomScheduleAvailability)
4. Opción "Aplicar a todo el curso" (applyToWholeCourse):
   → Replica el bloque en todas las secciones-curso del mismo scope
5. Opción "Aplicar docente a todo el curso":
   → Replica la asignación de docente en secciones-curso hermanas
```

**Sistema "Mother Section"** (`bulkApplyCourseTeacherFromMother` / `bulkApplyCourseScheduleFromMother`):
- La primera sección de cada grupo (faculty+campus+course) es la "sección madre".
- Al asignar horario/docente a la madre, se propaga a todas las secciones hijas.

### 6.7 Capacidad y Aforo de Aulas

> Documentación detallada en: [`docs/analisis-aforo-aulas.md`](docs/analisis-aforo-aulas.md)

El sistema calcula la capacidad disponible según:

```
capacitySource:
  'VIRTUAL'        → Capacidad ilimitada
  'AULA'           → capacidad = classroomCapacity (aula activa)
  'SIN_AULA'       → capacidad = initialCapacity (sin aula asignada)
  'AULA_INACTIVA'  → capacidad = initialCapacity (aula inactiva)
```

---

## 7. Flujo de Trabajo del Administrador (Workflow)

El sistema implementa un **flujo secuencial controlado** mediante `workflowStepGuard`:

```
┌──────────────────────────────────────────────────────────────────────┐
│                    WORKFLOW SECUENCIAL                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PASO 1a: Configurar Periodo Activo                                  │
│  /admin/periods                                                      │
│  └─ Crear periodo → establecer fechas → activar                     │
│                    │                                                  │
│                    ▼                                                  │
│  PASO 1b: Ejecutar Nivelación                                        │
│  /admin/leveling                                                     │
│  └─ Cargar Excel → revisar plan → aplicar estructura                 │
│     └─ Modo REPLACE: nueva corrida completa                          │
│     └─ Modo APPEND: agregar alumnos a corrida existente              │
│                    │                                                  │
│                    ▼                                                  │
│  PASO 2: Gestionar Secciones                                         │
│  /admin/sections                                                     │
│  └─ Asignar Horarios → Asignar Docentes → Asignar Aulas             │
│     └─ Vista "Horarios y Docentes": programar bloques                │
│     └─ Vista "Alumnos": ver matriculados por sección-curso           │
│                    │                                                  │
│                    ▼                                                  │
│  PASO 3: Ejecutar Matrícula                                          │
│  /admin/matricula                                                    │
│  └─ Previsualizar → matricular por facultad                          │
│     └─ Requiere: al menos 1 facultad con horarios+docentes completos │
│                    │                                                  │
│                    ▼                                                  │
│  PASO 4: Exportar y Reportes                                         │
│  /admin/export         → Exportar asignaciones (Excel)               │
│  /admin/reports/program → Reportes por programa                      │
│  /admin/reports/summary → Resumen general de asistencia              │
│  /admin/grades          → Gestión de notas                           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Requisitos por Paso

| Paso | Ruta | Requisito |
|------|------|-----------|
| Periodos | `/admin/periods` | Ninguno (siempre accesible) |
| Nivelación | `/admin/leveling` | Periodo activo existente |
| Secciones | `/admin/sections` | Corrida de nivelación aplicada |
| Matrícula | `/admin/matricula` | ≥1 facultad lista (horarios + docentes) |
| Exportar | `/admin/export` | Alumnos asignados > 0 |
| Reportes | `/admin/reports/*` | Corrida de nivelación aplicada |

---

## 8. Páginas del Frontend (Web)

### 8.1 Portal Administrador (26 páginas)

| Página | Archivo | Descripción |
|--------|---------|-------------|
| Dashboard | `admin-dashboard.page.ts` | Panel principal con métricas y progreso |
| Periodos | `admin-periods.page.ts` | CRUD de periodos académicos |
| Nivelación | `admin-leveling.page.ts` (68KB) | Motor completo de nivelación |
| Secciones | `admin-sections.page.ts` (61KB) | Gestión de secciones con filtros |
| Horarios | `admin-section-schedule.page.ts` | Programación de bloques por sección |
| Conflictos | `admin-schedule-conflicts.page.ts` | Visualización de cruces de horario |
| Docentes | `admin-teachers.page.ts` | Catálogo de docentes |
| Aulas | `admin-classrooms.page.ts` (31KB) | Gestión de aulas y pabellones |
| Matrícula | `admin-matricula.page.ts` (27KB) | Previsualización y ejecución |
| Exportar | `admin-export-assigned.page.ts` | Exportación a Excel |
| Asistencia | `admin-section-attendance.page.ts` | Asistencia por sección |
| Reportes Programa | `admin-reports-program.page.ts` | Reportes por programa |
| Reportes Resumen | `admin-reports-summary.page.ts` | Resumen general |
| Config Notas | `admin-grade-config.page.ts` | Configuración esquema de notas |
| Notas | `admin-grades.page.ts` | Gestión de calificaciones |
| Reportes Notas | `admin-grades-reports.page.ts` | Reportes consolidados de notas |

### 8.2 Portal Docente

| Página | Archivo | Descripción |
|--------|---------|-------------|
| Mi Horario | `teacher-schedule.page.ts` | Horario personal del docente |
| Asistencia | `teacher-attendance.page.ts` | Lista de secciones para marcar |
| Marcar Asistencia | `teacher-section-attendance.page.ts` | Formulario de asistencia por sesión |
| Notas | `teacher-grades.page.ts` | Lista de secciones para calificar |
| Registrar Notas | `teacher-section-grades.page.ts` | Formulario de notas por sección |

### 8.3 Portal Alumno

| Página | Archivo | Descripción |
|--------|---------|-------------|
| Mi Horario | `student-schedule.page.ts` | Horario del alumno con info de aula/zoom |
| Mi Asistencia | `student-attendance.page.ts` | Estado de asistencia por curso |
| Mis Notas | `student-grades.page.ts` | Notas por curso con promedio |

---

## 9. Integraciones Externas

### 9.1 Sistema Akademic

El módulo `AkademicService` actúa como proxy hacia el sistema académico principal:

```
Modos de operación (variable AKADEMIC_MODE):
├── 'mock'  → Usa fixtures locales (datos de prueba)
└── 'real'  → Consulta API de Akademic via HTTP GET
    ├── Requiere AKADEMIC_COOKIE (sesión válida)
    ├── Requiere AKADEMIC_SECCIONES_URL
    ├── Timeout: 15 segundos
    └── Manejo de errores: 401/403 → cookie expirada
```

---

## 10. Base de Datos y Migraciones

### 10.1 Sistema de Migraciones

El sistema utiliza **34 migraciones** ejecutadas automáticamente al iniciar (`DB_RUN_MIGRATIONS=true`):

| # | Migración | Descripción |
|---|-----------|-------------|
| 001 | init | Tablas iniciales |
| 002-005 | academic-catalogs | Catálogos académicos (carreras, sedes, cursos) |
| 006-008 | section-leveling | Campos de nivelación en secciones |
| 009-010 | section-courses | Relación sección↔curso multi-matricula |
| 011-015 | teachers-refactor | Docentes, sección-curso, refactorización |
| 016-018 | catalogs-uuid | UUIDs para catálogos, perfiles de alumnos |
| 019-020 | admin-seed | Creación del admin por defecto |
| 021 | period-kind | Tipos de periodo en español |
| 022-025 | leveling-runs | Sistema de corridas de nivelación |
| 026-028 | student-fields | Campos adicionales para alumnos |
| 029-031 | classrooms | Modelo de aulas y pabellones |
| 032 | rename-fica | Renombrar facultad FICA |
| 033 | schedule-reference | Campos de referencia en bloques horarios |
| 034 | grades-core | Sistema completo de calificaciones |

### 10.2 Ejecutar Migraciones

```sh
# Automáticamente al iniciar la API (en desarrollo)
DB_RUN_MIGRATIONS=true

# Manualmente
npx nx run api:migrate
```

---

## 11. Acceso al Sistema

### 11.1 Entornos de Desarrollo (Local)

| Servicio | URL | Descripción |
|----------|-----|-------------|
| Frontend | `http://localhost:4200` | Interfaz web Angular |
| API (Swagger) | `http://localhost:3000/docs` | Documentación interactiva de la API |
| Adminer | `http://localhost:8080` | Gestión visual de MySQL |

### 11.2 Entornos Docker

| Servicio | URL |
|----------|-----|
| Frontend | `http://localhost:4201` |
| API | `http://localhost:3333` |
| Adminer | `http://localhost:8080` |

### 11.3 Comandos de Desarrollo

```sh
# Iniciar con Docker
docker-compose -f docker-compose.dev.yml up

# Iniciar localmente
npx nx serve api          # Backend en :3000
npx nx serve web          # Frontend en :4200

# Build
npx nx build api
npx nx build web
```

---

## 12. Documentación Adicional

| Documento | Ruta | Descripción |
|-----------|------|-------------|
| Modelo de Datos | [`docs/modelo-de-datos.md`](docs/modelo-de-datos.md) | Detalle de todas las entidades y relaciones |
| Algoritmos | [`docs/algoritmos.md`](docs/algoritmos.md) | Documentación exhaustiva de los algoritmos |
| Módulos API | [`docs/modulos-api.md`](docs/modulos-api.md) | Detalle de endpoints y servicios |
| Análisis Aforo | [`docs/analisis-aforo-aulas.md`](docs/analisis-aforo-aulas.md) | Especificación del modelo de aulas |

---

## 13. Constantes del Sistema

```typescript
// Configuración de nivelación
const HOURS_PER_GROUP = 4;                    // Horas semanales por grupo
const PRICE_PER_HOUR = 116;                   // Precio por hora docente
const FIRST_COURSE_COLUMN_INDEX = 14;         // Columna "O" del Excel

// Capacidades por defecto
const DEFAULT_INITIAL_CAPACITY = 45;          // Alumnos por sección
const DEFAULT_MAX_EXTRA_CAPACITY = 0;         // 0 = sin límite extra

// Validación de horarios
// Los tiempos deben estar alineados a media hora (HH:00 o HH:30)

// Notas
const APPROVED_THRESHOLD = 11;                // Nota mínima aprobatoria (vigesimal)
const GRADE_SCALE = [0, 20];                  // Escala vigesimal
```

---

> **Última actualización**: Febrero 2026
> **Versión del sistema**: 0.0.0 (desarrollo activo)
