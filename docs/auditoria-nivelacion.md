# Auditoría funcional y de datos – Nivelación / Matrícula
Fecha: 2026-03-05  
Responsable: Codex (GPT-5)

## 1. Alcance y módulos revisados
- **Nivelación (Excel)**: generación de grupos/secciones, modos REPLACE/APPEND, rama especial para facultad nueva.  
  - Backend: `apps/api/src/app/leveling/leveling.service.ts`, `leveling.controller.ts`
  - Front: `apps/web/src/app/pages/admin-leveling.page.ts`
- **Matrícula y reubicaciones**: previsualización, ejecución y limpieza; registro de cambios de sección.  
  - Backend: `leveling.service.ts` (matriculateRun, clearMatriculationForFaculty, listSectionCourseReassignments)
  - Front: `admin-matricula.page.ts`
- **Secciones / aulas / horarios**: planeación y conflictos.  
  - Backend: `apps/api/src/app/sections/sections.service.ts`
- **Tablas pivote clave**: `leveling_runs`, `sections`, `section_courses`, `leveling_run_student_course_demands`, `section_student_courses`, `schedule_blocks`, `section_course_reassignments`, `classrooms`.

## 2. Flujos y algoritmos principales
- **REPLACE (primera corrida)**  
  `buildCourseGroupUnits` → `buildSectionsFromGroupUnits` → inserciones masivas (usuarios, secciones, section_courses, demandas, planned capacities).  
  Capacidad: `initialCapacity + maxExtraCapacity`; modalid por override o default presencial.

- **APPEND (corrida activa)**  
  - Detecta facultad totalmente nueva → trata como primera corrida (agrupa cursos, códigos resecuenciados desde “A”, ignora overrides obsoletos). Flag `isAllNewFaculties` propagado a front.  
  - Caso mixto/existente → usa expansión de oferta (`expandOfferForAppend`), reutiliza asientos libres y puede crear secciones nuevas.

- **Matriculación**  
  `matriculateRun(runId, facultyGroup, strategy)` asigna alumnos-curso pendientes a section_courses del periodo. Respeta capacidad/aula/horario (conflictos).  
  Limpieza por facultad (`clearMatriculationForFaculty`) borra `section_student_courses` de esa facultyGroup.

- **Reasignaciones**  
  Cada cambio de alumno-curso registra fila en `section_course_reassignments` con from/to section_course, motivo y usuario. Endpoint de listado añadido:  
  `GET /api/admin/leveling/runs/:runId/section-course-reassignments?facultyGroup=FICA&limit=200`.

## 3. Decisiones manuales del usuario (puntos de control)
- Edición de modalidad de grupos (P/V) en “Edición de grupos”: obliga a “Regenerar secciones”.
- Ajuste de aforo base y extra antes de planificar.
- Selección de modo REPLACE/APPEND y confirmación de “Aplicar”.
- Inclusión de curso de bienvenida: requiere nombre y modo; tamaño de grupo válido si es BY_SIZE.
- Reasignaciones manuales de matrícula: vía UI de conflictos o tabla de reassignments.
- Limpieza de matrícula por facultad.

## 4. Riesgos y observaciones
- **APPEND mixto**: si el Excel mezcla faculties nuevas y existentes, se va por rama expansión (no se muestra resumen); documentar este comportamiento.  
- **Overrides obsoletos**: en rama “all-new” se ignoran; en ramas strict lanzan error.  
- **Matriculación y reassign**: `changedBy` puede quedar null; sería mejor hacerlo obligatorio.  
- **Paginación reassignments**: hoy límite configurable (default 200, tope 1000); no hay rango por fecha.
- **Mensajes**: algunos 500 genéricos al validar APPEND; conviene mensajes más específicos por facultad/campus/curso.

## 5. Chequeos de integridad recomendados (SQL)
- Duplicados de secciones por código:  
  `SELECT code, COUNT(*) c FROM sections GROUP BY code HAVING c > 1;`
- Secciones sin cursos:  
  `SELECT s.id,s.code FROM sections s LEFT JOIN section_courses sc ON sc.sectionId=s.id WHERE sc.id IS NULL;`
- Asientos negativos (capacidades planificadas):  
  `SELECT * FROM leveling_run_section_course_capacities WHERE plannedCapacity < 0;`
- Demandas huérfanas (sin sección asignada tras matricular):  
  ```
  SELECT d.* 
  FROM leveling_run_student_course_demands d
  LEFT JOIN section_student_courses ssc ON ssc.studentId=d.studentId
    AND ssc.sectionCourseId IN (
      SELECT id FROM section_courses WHERE courseId=d.courseId AND periodId=(SELECT periodId FROM leveling_runs WHERE id=d.runId LIMIT 1)
    )
  WHERE ssc.sectionCourseId IS NULL;
  ```
- Reasignaciones fuera de periodo del run:  
  Verificar que `from` y `to` section_course pertenezcan al mismo `periodId` del `run`.
- Choques de aula/docente: usar reporte de conflictos existente en UI o  
  `apps/api/src/app/sections/sections.service.ts` (consultas de schedule conflict).

## 6. Pruebas funcionales sugeridas
1) **REPLACE** con periodo limpio: genera secciones, resumen visible, códigos desde A.  
2) **APPEND solo facultad nueva**: muestra resumen (flag `isAllNewFaculties`), agrupa cursos por sección, códigos desde A.  
3) **APPEND facultad existente**: no muestra resumen; no altera grupos manuales; crea secciones solo si falta capacidad.  
4) **Matricular** faculty A, luego APPEND faculty B y matricular solo B: matrícula de A permanece intacta.  
5) **Reasignar alumno** (UI conflictos): aparece en “Cambios de sección” y en `section_course_reassignments`; ver límite 200.  
6) **Limpiar matrícula** por facultad: elimina solo registros de esa facultyGroup y deja bitácora esperada.

## 7. Recomendaciones puntuales
- Hacer obligatorio `changedBy` en reassignments y agregar índice `(fromSectionCourseId, toSectionCourseId, changedAt)`.
- Añadir filtro por fecha y paginación al endpoint de reassignments si el historial crece.
- Mejorar mensajes de error en APPEND mixto: indicar qué facultyGroup/campus/curso causa incapacidad de asignar.
- Registrar auditoría ligera de acciones sensibles (REPLACE, clearMatriculation, matriculateRun) con actor y timestamp.

## 8. Seguimiento
- Ejecutar los chequeos SQL en el periodo actual y adjuntar resultados.  
- Validar en staging: APPEND nueva facultad (resumen visible) y reassignments listándose con el nuevo endpoint.  
- Documentar en README/operativa la distinción APPEND “nueva facultad” vs “mixta”.
