# 🔌 Módulos y Endpoints API - UAI Nivelación

> Documentación de todos los módulos del backend, sus controladores, servicios y endpoints.

---

## 1. Módulo de Autenticación (`AuthModule`)

### Controlador: `auth.controller.ts`

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/login` | Iniciar sesión | Público |
| GET | `/api/auth/me` | Obtener usuario actual | JWT |

### Servicio: `auth.service.ts`

| Método | Descripción |
|--------|-------------|
| `login(body)` | Autenticar por usuario/password con detección inteligente de tipo |
| `me(userId)` | Retornar perfil del usuario autenticado |
| `verifyPassword(userId, hash, plain)` | Verificar contraseña con migración PLAIN→bcrypt |

---

## 2. Módulo de Periodos (`PeriodsModule`)

### Controladores

#### `periods.controller.ts` (Admin)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/periods` | Listar periodos |
| POST | `/api/admin/periods` | Crear periodo |
| PUT | `/api/admin/periods/:id` | Actualizar periodo |
| DELETE | `/api/admin/periods/:id` | Eliminar periodo |
| POST | `/api/admin/periods/:id/activate` | Activar periodo |

#### `periods-public.controller.ts` (Público)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/periods/active` | Obtener periodo activo (público) |

### Servicio: `periods.service.ts`

| Método | Descripción |
|--------|-------------|
| `list()` | Listar todos los periodos |
| `getActivePeriodIdOrThrow()` | Obtener ID del periodo activo |
| `getOperationalPeriodIdOrThrow()` | Periodo operativo (activo o con contexto) |
| `activate(id)` | Activar un periodo (desactivar el anterior) |

---

## 3. Módulo de Nivelación (`LevelingModule`)

### Controlador: `leveling.controller.ts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/leveling/config` | Obtener configuración de nivelación |
| PUT | `/api/admin/leveling/config` | Actualizar capacidades |
| POST | `/api/admin/leveling/plan` | Procesar Excel y generar plan |
| GET | `/api/admin/leveling/active-run-summary` | Resumen del dashboard |
| GET | `/api/admin/leveling/runs/:id` | Detalles de una corrida |
| GET | `/api/admin/leveling/runs/:id/reports` | Reportes JSON de la corrida |
| GET | `/api/admin/leveling/runs/:id/sections` | Secciones de la corrida |
| POST | `/api/admin/leveling/runs/:id/manual-section-course` | Crear sección-curso manual |
| DELETE | `/api/admin/leveling/runs/:id/manual-section-course/:scId` | Eliminar sección-curso manual |
| GET | `/api/admin/leveling/runs/:id/matriculation-preview` | Previsualizar matrícula |
| POST | `/api/admin/leveling/runs/:id/matriculate` | Ejecutar matrícula |
| GET | `/api/admin/leveling/runs/:id/schedule-conflicts` | Conflictos de horario |

### Servicio: `leveling.service.ts` (8,092 líneas)

**Métodos principales:**

| Método | Línea | Descripción |
|--------|-------|-------------|
| `getConfig()` | 252 | Obtener configuración (capacidades) |
| `updateConfig(params)` | 433 | Actualizar capacidades |
| `getActiveRunSummary()` | 265 | Métricas para dashboard (periodo + corrida + métricas) |
| `planFromExcel(params)` | 447 | Pipeline completo: parseo → planificación → aplicación |
| `getRunDetails(runId)` | 730 | Detalles y métricas de una corrida |
| `getRunReports(runId)` | 809 | Reportes JSON almacenados |
| `listRunSections(runId)` | 814 | Secciones con secciones-curso anidadas |
| `createManualSectionCourse(runId, dto)` | 937 | Crear sección-curso manual |
| `deleteManualSectionCourse(runId, scId)` | 1032 | Eliminar sección-curso manual |
| `matriculateRun(runId, faculty, strategy)` | 1118 | Ejecutar matrícula |
| `getRunMatriculationPreview(runId, faculty)` | 1701 | Previsualizar matrícula |
| `listRunScheduleConflicts(params)` | 1979 | Detectar conflictos |

**Métodos privados del pipeline:**

| Método | Descripción |
|--------|-------------|
| `parseExcel(buffer, careerMap, courseMap)` | Parsear XLSX |
| `buildCourseGroupUnits(params)` | Calcular unidades de grupo |
| `buildSectionsFromGroupUnits(params)` | Crear secciones planificadas |
| `assignRowStudentCourses(params)` | Asignar alumnos a secciones |
| `buildCourseGroupSummary(params)` | Resumen financiero |
| `buildGroupPlan(units, courses)` | Plan de grupos detallado |
| `buildProgramNeeds(students, courses)` | Necesidades por carrera |
| `resequenceSectionCodes(sections)` | Asignar códigos A-PS-IC |
| `applyPlan(params)` | Persistir en BD |
| `appendDemandsToRun(params)` | Agregar demandas incrementales |
| `expandOfferForAppend(manager, params)` | Expandir oferta |
| `previewAppendDemandsAndExpansion(students, opts)` | Preview de append |

---

## 4. Módulo de Secciones (`SectionsModule`)

### Controlador: `sections.controller.ts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/sections` | Listar secciones |
| GET | `/api/admin/sections/filters/faculty` | Filtros de facultad |
| GET | `/api/admin/sections/filters/faculty-detailed` | Filtros detallados |
| GET | `/api/admin/sections/filters/campus` | Filtros de campus |
| GET | `/api/admin/sections/filters/course` | Filtros de curso |
| GET | `/api/admin/sections/by-course-filter` | Secciones por filtro curso |
| GET | `/api/admin/sections/course-scope-progress` | Progreso demanda vs oferta |
| GET | `/api/admin/sections/schedule-conflicts` | Conflictos de horario |
| GET | `/api/admin/sections/reassignment-options` | Opciones de reasignación |
| POST | `/api/admin/sections/reassign` | Reasignar alumno |
| POST | `/api/admin/sections` | Crear sección |
| PUT | `/api/admin/sections/:id/capacity` | Actualizar capacidad |
| PUT | `/api/admin/sections/:id/teacher` | Asignar docente |
| PUT | `/api/admin/sections/:id/teacher-by-course` | Asignar docente por curso |
| POST | `/api/admin/sections/bulk-apply-teacher` | Propagar docente (madre→hijas) |
| POST | `/api/admin/sections/bulk-apply-schedule` | Propagar horario (madre→hijas) |
| PUT | `/api/admin/sections/:id/classroom-by-course` | Asignar aula por curso |
| GET | `/api/admin/sections/:id/courses` | Cursos de una sección |
| GET | `/api/admin/sections/:id/students` | Alumnos de una sección |
| GET | `/api/admin/sections/:id/course-capacity` | Capacidad por curso |
| PUT | `/api/admin/sections/:id/course-capacity` | Actualizar capacidad por curso |
| GET | `/api/admin/sections/export-assigned` | Exportar asignaciones (Excel) |
| GET | `/api/admin/sections/:id/export-students` | Exportar alumnos (Excel/PDF) |

### Servicio: `sections.service.ts` (3,628 líneas)

Funciones clave: `listByCourseFilter`, `getCourseScopeProgress`, `listScheduleConflicts`, `listReassignmentOptions`, `reassignStudentSectionCourse`, `bulkApplyCourseTeacherFromMother`, `bulkApplyCourseScheduleFromMother`, `assignClassroomByCourse`, `buildAssignedSectionCoursesExportWorkbook`, `buildSectionCourseStudentsExportPdf`.

---

## 5. Módulo de Bloques Horarios (`ScheduleBlocksModule`)

### Controlador: `schedule-blocks.controller.ts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/schedule-blocks/section/:id` | Listar bloques por sección |
| GET | `/api/admin/schedule-blocks/section-course/:id` | Listar por sección-curso |
| POST | `/api/admin/schedule-blocks` | Crear bloque horario |
| PUT | `/api/admin/schedule-blocks/:id` | Actualizar bloque |
| DELETE | `/api/admin/schedule-blocks/:id` | Eliminar bloque |

### Servicio: `schedule-blocks.service.ts` (493 líneas)

Funciones clave: `assertNoOverlap`, `buildReferenceDefaults`, `resolveIgnoredSectionCourseIdsForWholeCourse`.

---

## 6. Módulo de Aulas (`ClassroomsModule`)

### Controlador: `classrooms.controller.ts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/classrooms` | Listar aulas (con filtros) |
| POST | `/api/admin/classrooms` | Crear aula |
| PUT | `/api/admin/classrooms/:id` | Actualizar aula |
| DELETE | `/api/admin/classrooms/:id` | Eliminar aula |
| GET | `/api/admin/classrooms/pavilions` | Listar pabellones |
| POST | `/api/admin/classrooms/pavilions` | Crear pabellón |
| PUT | `/api/admin/classrooms/pavilions/:id` | Actualizar pabellón |
| DELETE | `/api/admin/classrooms/pavilions/:id` | Eliminar pabellón |
| GET | `/api/admin/classrooms/campuses` | Listar sedes |

---

## 7. Módulo de Docentes (`TeachersModule`)

### Controlador: `teachers.controller.ts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/teachers` | Listar docentes |
| POST | `/api/admin/teachers` | Crear docente |
| PUT | `/api/admin/teachers/:id` | Actualizar docente |
| DELETE | `/api/admin/teachers/:id` | Eliminar docente |

---

## 8. Módulo de Asistencia (`AttendanceModule`)

### Controlador: `attendance.controller.ts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/attendance/section/:id/sessions` | Sesiones por sección |
| POST | `/api/admin/attendance/sessions` | Crear sesión de asistencia |
| GET | `/api/admin/attendance/sessions/:id/records` | Registros de una sesión |
| PUT | `/api/admin/attendance/sessions/:id/records` | Actualizar asistencia |

---

## 9. Módulo de Calificaciones (`GradesModule`)

### Controladores

#### `admin-grades.controller.ts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/grades/scheme` | Obtener esquema de notas |
| PUT | `/api/admin/grades/scheme` | Actualizar esquema |
| GET | `/api/admin/grades/section-courses` | Listar secciones-curso |
| GET | `/api/admin/grades/section-course/:id` | Notas por sección-curso |
| PUT | `/api/admin/grades/section-course/:id` | Guardar notas |
| POST | `/api/admin/grades/section-course/:id/publish` | Publicar notas |
| GET | `/api/admin/grades/reports/filters` | Filtros para reportes |
| GET | `/api/admin/grades/reports/students` | Reporte de alumnos |
| GET | `/api/admin/grades/reports/averages` | Reporte de promedios |
| GET | `/api/admin/grades/reports/attendance` | Reporte de asistencia |

#### `teacher-grades.controller.ts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/teacher/grades/section-courses` | Mis secciones-curso |
| GET | `/api/teacher/grades/section-course/:id` | Ver notas de mi sección |
| PUT | `/api/teacher/grades/section-course/:id` | Guardar notas |
| POST | `/api/teacher/grades/section-course/:id/publish` | Publicar notas |

#### `student-grades.controller.ts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/student/grades` | Mis notas |

---

## 10. Módulo del Alumno (`StudentModule`)

### Controlador: `student.controller.ts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/student/schedule` | Mi horario |
| GET | `/api/student/attendance` | Mi asistencia |

---

## 11. Módulo del Docente (`TeacherModule`)

### Controlador: `teacher.controller.ts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/teacher/schedule` | Mi horario |
| GET | `/api/teacher/attendance` | Mis secciones para asistencia |
| GET | `/api/teacher/attendance/:sectionCourseId` | Sesiones de una sección |

---

## 12. Módulo de Integraciones (`IntegrationsModule`)

### Controlador: `akademic.controller.ts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/integrations/akademic/secciones` | Obtener secciones de Akademic |

### Servicio: `akademic.service.ts`

Proxy HTTP hacia el sistema Akademic de la universidad. Soporta modo mock (fixtures locales) y modo real (API HTTP con cookie de sesión).

---

## 13. Infraestructura Transversal

### 13.1 Guards

| Guard | Descripción |
|-------|-------------|
| `JwtAuthGuard` | Verificar JWT válido |
| `RolesGuard` | Verificar rol del usuario |
| `AdminPeriodContextMiddleware` | Inyectar periodo activo en contexto |

### 13.2 Decoradores

- `@CurrentUser()` → Extraer usuario del request
- `@Roles(Role.ADMIN)` → Declarar roles requeridos

### 13.3 Filtros

- `HttpExceptionFilter` → Formatear errores HTTP
