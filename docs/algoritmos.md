# ⚙️ Algoritmos del Sistema - UAI Nivelación

> Documentación exhaustiva de todos los algoritmos implementados en el sistema.

---

## 1. Motor de Nivelación

### 1.1 Parseo de Excel (`parseExcel`)

**Ubicación:** `leveling.service.ts` — Líneas 2125–2349

**Propósito:** Leer y transformar el archivo XLSX de la universidad en datos estructurados.

**Algoritmo:**

```
ENTRADA: Buffer del archivo XLSX + Mapa carrera→facultad + Catálogo de cursos

1. Leer Excel con SheetJS (sheet_to_json, modo crudo)
2. Detectar fila de encabezado (findHeaderRowIndex):
   - Busca la fila que contenga "DNI" o "DOCUMENTO" en alguna celda
   - Fallback: usar posiciones legacy fijas

3. Resolver columnas dinámicamente (resolveExcelColumns):
   - Busca nombres de columna por coincidencia parcial
   - Columnas buscadas: orden, DNI, apellidos, nombres, email, sexo,
     codigo alumno, carrera, area, campus, modalidad, condicion,
     necesita nivelación, programa nivelación, fecha examen, facultad
   - Columnas de cursos: detecta por nombre del curso en el catálogo

4. Deduplicación por DNI:
   - Si hay columna de fecha de examen:
     a. Agrupar filas por DNI
     b. Si hay duplicados: ordenar por fecha descendente
     c. Conservar solo la fila con fecha más reciente
   - Si no: procesar todas las filas

5. Para cada fila válida:
   a. Determinar elegibilidad:
      - Si existe columna "programa nivelación" → programVal === "SI"
      - Si existe columna "condición" → condición=INGRESO && necesita=SI
      - Si no existe filtro → todos son elegibles
   b. Normalizar DNI (quitar ceros iniciales, validar dígitos)
   c. Extraer nombre completo (o construir desde apellidos+nombres)
   d. Determinar facultad: prioridad → columna facultad > mapeo carrera > fallback por área
   e. Normalizar campus: "ICA"→"SEDE ICA", "CHINCHA"→"SEDE CHINCHA"
   f. Modalidad de sección: SIEMPRE "PRESENCIAL" (regla de negocio)
   g. sourceModality: conservar la modalidad original del Excel
   h. Extraer cursos necesitados (columnas de nota donde necesita refuerzo)
   i. Merge si el DNI ya existe (unificar cursos de múltiples filas)

SALIDA: {
  rowsRead: number,
  students: ParsedStudent[],
  unknownCareers: string[],
  courseNames: CourseName[]
}
```

**Detalle de detección de cursos necesitados (`extractNeededCourses`):**
- Para cada columna de curso en el Excel
- Si la celda contiene un valor que indica que el alumno necesita el curso
- El valor puede ser "SI", "REQUIERE", una nota baja, etc.
- Se agrega el curso a la lista de `levelingCourses`

---

### 1.2 Formación de Grupos (`buildCourseGroupUnits`)

**Ubicación:** `leveling.service.ts` — Líneas 2383–2490

**Propósito:** Determinar cuántos grupos se necesitan por curso/campus/facultad.

**Algoritmo:**

```
ENTRADA: students[], courseNames[], sectionCapacity, groupModalityOverrides

1. Contar demanda por fila (facultyGroup × campusName × courseName):
   Para cada alumno:
     Para cada curso que necesita:
       Si es curso Welcome → conteo separado
       Si no → incrementar countsByRow[faculty|campus][course]

2. Crear grupos (CourseGroupUnit) para cursos regulares:
   Para cada fila (faculty × campus):
     Para cada curso:
       demanda = countsByRow[fila][curso]
       chunks = splitCourseGroups(demanda, capacidad, 'PRESENCIAL')
       
       splitCourseGroups(total, divisor):
         Si total = 0 → []
         groups = ceil(total / divisor)
         baseSize = floor(total / groups)
         remainder = total % groups
         → [baseSize+1, baseSize+1, ..., baseSize, baseSize]
         (los primeros 'remainder' grupos tienen +1)
       
       Para cada chunk:
         crear CourseGroupUnit {
           id: "FICA|ICA|MATEMATICA|1",
           facultyGroup, campusName, courseName,
           size: chunk_size,
           modality: override ?? 'PRESENCIAL'
         }

3. Crear grupos para curso Welcome (si aplica):
   modo = 'BY_SIZE' | 'SINGLE_GROUP'
   Si SINGLE_GROUP → un solo grupo con todos los alumnos
   Si BY_SIZE → dividir por welcomeGroupSize
   Modalidad: siempre VIRTUAL
   facultyGroup: "GENERAL"

4. Validar overrides: verificar que todos los IDs referenciados existan

SALIDA: CourseGroupUnit[] (ordenados por ID)
```

**Ejemplo concreto:**
```
Demanda: FICA-ICA tiene 95 alumnos que necesitan MATEMATICA
Capacidad: 45

splitCourseGroups(95, 45):
  groups = ceil(95/45) = 3
  baseSize = floor(95/3) = 31
  remainder = 95 % 3 = 2
  → [32, 32, 31]

Resultado: 3 CourseGroupUnits de MATEMATICA para FICA-ICA
```

---

### 1.3 Construcción de Secciones (`buildSectionsFromGroupUnits`)

**Ubicación:** `leveling.service.ts` — Líneas 2565–2849

**Propósito:** Crear las secciones planificadas a partir de los grupos.

**Algoritmo:**

```
ENTRADA: students[], groupUnits[], courseNames[], capacities

1. Clasificar grupos:
   - VIRTUAL → virtualCoursesByFaculty + virtualQuotaByRow
   - PRESENCIAL → presencialByRow (contar grupos por curso)

2. Crear secciones presenciales:
   Para cada fila presencial:
     maxCourseGroups = max(groupsByCourse[curso] para cada curso)
     requiredByStudents = ceil(studentsEnFila / sectionCapacity)
     sectionCount = max(maxCourseGroups, requiredByStudents)
     
     Para i = 1 hasta sectionCount:
       neededCourses = cursos donde groupsByCourse[curso] >= i
       crear PlannedSection { modality: 'PRESENCIAL', ... }

3. Crear secciones virtuales:
   Una sección virtual por facultyGroup
   Contiene todos los cursos marcados como VIRTUAL para esa facultad

4. Asignar alumnos:
   a. Asignar a sección virtual GENERAL (si existe):
      - Todos los alumnos con cursos que coincidan → asignar
   b. Asignar cuotas virtuales por fila:
      - Ordenar alumnos por cantidad de cursos virtuales necesitados (desc)
      - Asignar respetando cuotas por curso
   c. Asignar cursos presenciales:
      - Calcular cursos pendientes (no cubiertos por virtual)
      - Llamar a assignRowStudentCourses()

SALIDA: PlannedSection[] con estudiantes y cursos asignados
```

---

### 1.4 Asignación de Alumnos por Curso (`assignRowStudentCourses`)

**Ubicación:** `leveling.service.ts` — Líneas 2953–3160

**Propósito:** Asignar cada alumno a la sección correcta para cada uno de sus cursos, respetando capacidad.

**Algoritmo detallado:**

```
ENTRADA: 
  rowStudents: [{student, neededCourses}]
  sections: PlannedSection[]
  courseNames: CourseName[]
  sectionCapacity: number

═══════════════════════════════════════════════
FASE 1: PREPARACIÓN
═══════════════════════════════════════════════

1. Deduplicar alumnos por DNI (unificar cursos)
2. Construir índice: curso → [índices de secciones que ofrecen ese curso]
3. Verificar cobertura: para cada curso, al menos una sección lo ofrece

═══════════════════════════════════════════════
FASE 2: RESTAURAR ESTADO EXISTENTE
═══════════════════════════════════════════════

4. Para cada sección con alumnos ya asignados:
   - Reconstruir conteo de alumnos por curso
   - Marcar cursos ya cubiertos para esos alumnos

═══════════════════════════════════════════════
FASE 3: ORDENAR CURSOS POR RESTRICCIÓN
═══════════════════════════════════════════════

5. Ordenar cursos por:
   a. Menor número de secciones que ofrecen el curso (más restringido primero)
   b. Mayor demanda de alumnos (desempate)

   Razón: Los cursos con menos opciones de sección se asignan
   primero para evitar deadlocks de capacidad.

═══════════════════════════════════════════════
FASE 4: ASIGNACIÓN CURSO POR CURSO
═══════════════════════════════════════════════

6. Para cada curso (en orden de restricción):
   a. Obtener secciones candidatas para el curso
   b. Agrupar alumnos pendientes por carrera (careerKey)
   c. Ordenar grupos por tamaño descendente
   d. Dentro de cada grupo, ordenar por DNI (determinismo)
   
   e. Cursor de sección = 0
   f. Para cada alumno:
      - Si ya tiene el curso cubierto → skip
      - advanceCursor(): avanzar a siguiente sección con capacidad
      - Si no hay más secciones → ERROR (blocked)
      - assignCourseToSection(sección, alumno, curso):
        * Si la sección tiene capacidad para ese curso:
          - Agregar alumno a la sección (si no está)
          - Registrar curso para ese alumno en esa sección
          - Incrementar conteo del curso en esa sección
          - Marcar curso como cubierto para el alumno
        * Si no → ERROR

═══════════════════════════════════════════════
FASE 5: VERIFICACIÓN FINAL
═══════════════════════════════════════════════

7. Para cada alumno, verificar que TODOS sus cursos estén cubiertos
   Si falta alguno → ERROR con detalle

SALIDA: 
  {ok: true} → Asignación exitosa, secciones actualizadas in-place
  {ok: false, blocked: {student, course}} → Error con detalle
```

**Propiedades del algoritmo:**
- **Cohort grouping**: mantiene alumnos de la misma carrera juntos en la misma sección
- **Balanced filling**: el cursor round-robin distribuye equitativamente
- **Constraint-first**: prioriza los cursos más difíciles de asignar
- **Deterministic**: el ordenamiento por DNI garantiza resultados reproducibles

---

### 1.5 Codificación de Secciones (`resequenceSectionCodes`)

**Ubicación:** `leveling.service.ts` — Líneas 3448–3479

**Formato del código:**

```
[LETRA]-[MODALIDAD]-[CAMPUS]

Donde:
  LETRA = A, B, C, ... Z, AA, AB, ...
  MODALIDAD = PS (Presencial) | VI (Virtual)
  CAMPUS = IC (Ica) | CH (Chincha) | LM (Lima) | VI (Virtual)

Orden de asignación:
  1. Agrupar secciones por (facultyGroup × campusCode × modality)
  2. Ordenar cada grupo
  3. Asignar letras secuenciales dentro del grupo

Ejemplos:
  A-PS-IC  → Primera sección presencial de Ica
  B-PS-IC  → Segunda sección presencial de Ica
  A-VI-CH  → Primera sección virtual de Chincha
```

---

### 1.6 Persistencia (`applyPlan`)

**Ubicación:** `leveling.service.ts` — Líneas 3482–3874

**Algoritmo de aplicación:**

```
Todo dentro de transacción atómica (EntityManager):

1. Crear/actualizar usuarios (alumnos):
   - UPSERT por DNI
   - Preservar datos existentes si el alumno ya existe

2. Crear secciones:
   - INSERT si no existe (por código)
   - UPDATE si existe (actualizar nombre, capacidades)

3. Crear section_courses:
   - Para cada sección × curso
   - Buscar courseId en catálogo por nombre canónico
   - INSERT IGNORE (evitar duplicados)

4. Crear section_student_courses (matrícula preliminar):
   - Para cada sección → para cada alumno → para cada curso del alumno en esa sección
   - INSERT IGNORE

5. Crear demandas (leveling_run_student_course_demands):
   - Para cada alumno → para cada curso que necesita
   - Registrar demand con metadata (facultyGroup, campusName, sourceModality)

6. Crear LevelingRun:
   - Hash SHA-256 del archivo fuente (detección de re-subida)
   - configJson: {initialCapacity, maxExtraCapacity}
   - reportsJson: resúmenes generados
   - Status: 'STRUCTURED'

SALIDA: ApplyStructureResult con métricas de creación/actualización
```

---

### 1.7 Expansión de Oferta para APPEND (`expandOfferForAppend`)

**Ubicación:** `leveling.service.ts` — Líneas 4858–5340

**Propósito:** Cuando se cargan nuevos alumnos (modo APPEND), encontrar dónde ubicarlos o crear nuevas secciones.

**Algoritmo:**

```
ENTRADA: pendingDemands[], groupUnits[]

1. Cargar estado actual de secciones-curso:
   - Capacidad, asignados actuales, modalidad

2. Para cada demanda pendiente (agrupada por curso × facultad × campus):
   
   INTENTAR ENCONTRAR SECCIÓN EXISTENTE:
   a. Buscar section_course compatible:
      - Mismo curso, misma facultad, mismo campus
      - Con capacidad disponible:
        available = initialCapacity + maxExtraCapacity - assignedCount
        (VIRTUAL = ilimitado)
   b. Si encontrada → asignar (reuso de oferta)
   
   SI NO EXISTE SECTION_COURSE PERO EXISTE SECCIÓN:
   c. Buscar sección del mismo scope sin ese curso
   d. Crear section_course en esa sección
   
   SI NO EXISTE SECCIÓN:
   e. createAutoExpansionSection():
      - Generar código único (evitar colisiones con códigos reservados)
      - Crear sección con capacidades de la configuración de la corrida
   f. createAutoExpansionSectionCourse():
      - Agregar el curso a la nueva sección
   
   CONVERSIÓN A VIRTUAL:
   g. Si hay demanda presencial sin aulas disponibles:
      - Buscar sección virtual del mismo facultyGroup
      - Si no existe → crear sección virtual
      - Reasignar demanda a virtual

3. Registrar métricas:
   - sectionsCreatedByExpansion
   - sectionCoursesCreatedByExpansion
   - offersReused
   - existingFreeSeatsDetected
   - newRequiredSeats
   - groupsConvertedToVirtual

SALIDA: ExpandOfferResult
```

---

### 1.8 Matriculación (`matriculateRun`)

**Ubicación:** `leveling.service.ts` — Líneas 1118–1699

**Algoritmo completo:**

```
ENTRADA: runId, facultyGroup? (filtro opcional), strategy

═══════════════════════════════════════════════
FASE 1: CARGA DE DATOS
═══════════════════════════════════════════════

1. Cargar secciones-curso con JOIN completo:
   - sections + courses + classrooms + pavilions
   - Calcular capacitySource:
     VIRTUAL → si modality LIKE '%VIRTUAL%'
     AULA → si classroomId NOT NULL y classroom activa
     SIN_AULA → si classroomId IS NULL
     AULA_INACTIVA → si classroom inactiva

2. Cargar bloques horarios de las secciones-curso

3. Cargar demandas pendientes (no asignadas):
   SELECT demands WHERE NOT EXISTS (section_student_courses)

═══════════════════════════════════════════════
FASE 2: VALIDACIÓN DE COBERTURA
═══════════════════════════════════════════════

4. Para cada curso con demanda:
   - Sumar capacidad operativa (secciones con horario + docente):
     * Virtual: capacidad ilimitada → ok
     * Presencial: sumar classroomCapacity de aulas
   - Si capacidad < demanda → ERROR con detalle del déficit

═══════════════════════════════════════════════
FASE 3: LIMPIEZA (si FULL_REBUILD)
═══════════════════════════════════════════════

5. Si strategy=FULL_REBUILD:
   DELETE FROM section_student_courses WHERE sectionCourseId IN (...)

═══════════════════════════════════════════════
FASE 4: CONSTRUIR CANDIDATOS
═══════════════════════════════════════════════

6. Para cada sección-curso (Candidate):
   - assignedCount = conteo actual de matriculados
   - blocks = bloques horarios
   - Calcular capacidad real disponible:
     VIRTUAL → Number.MAX_SAFE_INTEGER
     AULA → classroomCapacity - assignedCount
     SIN_AULA → initialCapacity + maxExtraCapacity - assignedCount

═══════════════════════════════════════════════
FASE 5: ASIGNACIÓN
═══════════════════════════════════════════════

7. Para cada demanda (alumno × curso):
   a. Obtener candidatos para ese curso
   b. Filtrar candidatos:
      - Misma facultad y campus (si aplica)
      - Con capacidad disponible
      - Sin conflicto de horario con bloques ya asignados al alumno:
        
        Para cada bloque del candidato:
          Para cada bloque ya asignado al alumno:
            Si mismo día Y timesOverlap(start1, end1, start2, end2)
            Y fechas se solapan
            → CONFLICTO

   c. Ordenar candidatos por prioridad:
      - Virtual con capacidad → primero
      - Misma facultad/campus → preferido
      - Más capacidad → preferido

   d. Asignar al mejor candidato:
      INSERT INTO section_student_courses
      Incrementar assignedCount del candidato

   e. Si no hay candidato válido:
      Agregar a lista "unassigned" con motivo:
      - "Sin capacidad disponible"
      - "Conflicto de horario con otra sección"
      - "No hay sección operativa (sin horario/docente)"

═══════════════════════════════════════════════
FASE 6: POST-PROCESAMIENTO
═══════════════════════════════════════════════

8. Detectar conflictos de horario post-asignación:
   Query SQL que cruza todos los bloques de secciones-curso
   asignadas al mismo alumno buscando superposiciones

9. Actualizar estado de la corrida:
   run.status = 'MATRICULATED'

SALIDA: LevelingMatriculationResult {
  runId, status,
  assignedCount: 150,
  unassigned: [{studentId, reason: "Sin capacidad"}],
  summaryBySectionCourse: [{sectionCourseId, assignedCount, capacity}],
  conflictsFoundAfterAssign: 3
}
```

---

## 2. Detección de Conflictos de Horario

### 2.1 Superposición Temporal (`timesOverlap`)

**Ubicación:** `common/utils/time.util.ts`

```typescript
function timesOverlap(startA, endA, startB, endB): boolean {
  // Convertir HH:mm a minutos
  a0 = hours(startA) * 60 + minutes(startA);
  a1 = hours(endA) * 60 + minutes(endA);
  b0 = hours(startB) * 60 + minutes(startB);
  b1 = hours(endB) * 60 + minutes(endB);
  
  // Overlap si y solo si: a empieza antes de que b termine Y a termina después de que b empiece
  return a0 < b1 && a1 > b0;
}
```

### 2.2 Conflictos de Alumno (`listScheduleConflicts` / `listRunScheduleConflicts`)

**Ubicación:** `sections.service.ts` L586-739, `leveling.service.ts` L1979-2123

```sql
-- Algoritmo SQL para detectar conflictos de alumno
SELECT ...
FROM section_student_courses ssc1
INNER JOIN section_student_courses ssc2
  ON ssc2.studentId = ssc1.studentId           -- Mismo alumno
  AND ssc2.sectionCourseId > ssc1.sectionCourseId  -- Evitar duplicados
INNER JOIN schedule_blocks b1 ON b1.sectionCourseId = sc1.id
INNER JOIN schedule_blocks b2 ON b2.sectionCourseId = sc2.id
  AND b1.dayOfWeek = b2.dayOfWeek              -- Mismo día
  AND b1.startTime < b2.endTime                -- Superposición temporal
  AND b1.endTime > b2.startTime
  AND COALESCE(b1.startDate, '1000-01-01') <= COALESCE(b2.endDate, '9999-12-31')
  AND COALESCE(b2.startDate, '1000-01-01') <= COALESCE(b1.endDate, '9999-12-31')
```

### 2.3 Conflictos de Docente (`assertTeacherScheduleAvailabilityForBlock`)

**Ubicación:** `sections.service.ts` L2283-2320

```
Para un bloque propuesto (sección-curso, día, horaInicio, horaFin):
1. Buscar TODOS los bloques del docente en el mismo periodo
2. Excluir el bloque actual (si es edición)
3. Excluir sectionCourseIds ignorados (para bulk operations)
4. Verificar que ningún bloque existente se superponga:
   - Mismo día de semana
   - timesOverlap(propuesto, existente)
   - Rangos de fecha se superponen
5. Si hay conflicto → lanzar ConflictException con detalle
```

### 2.4 Conflictos de Aula (`assertClassroomScheduleAvailabilityForBlock`)

**Ubicación:** `sections.service.ts` L2322-2362

```
Para un bloque propuesto en una sección-curso con aula asignada:
1. Obtener el classroomId de la sección-curso
2. Si no hay aula o es virtual → sin conflicto
3. Buscar TODOS los bloques que usan la misma aula
4. Excluir bloques de la misma sección-curso
5. Verificar superposición temporal + superposición de fechas
6. Si hay conflicto → lanzar ConflictException
```

---

## 3. Sistema de Calificaciones

### 3.1 Cálculo del Promedio Final (`computeFinalAverage`)

**Ubicación:** `grades.service.ts` L915-931

```
ENTRADA: components[], scoresByComponentId: Map<id, score>

1. isComplete = todos los componentes tienen nota registrada

2. Filtrar componentes con peso > 0 (excluir diagnóstico)
   weighted = components.filter(x => x.weight > 0)

3. totalWeight = sum(weighted.map(x => x.weight))
   Típicamente: 30 + 30 + 40 = 100

4. weightedSum = sum(weighted.map(x => score[x.id] * x.weight))
   Ejemplo: (15 * 30) + (12 * 30) + (16 * 40) = 450 + 360 + 640 = 1450

5. finalAverage = roundUpGrade(weightedSum / totalWeight)
   1450 / 100 = 14.50 → roundUp → 15

6. approved = finalAverage >= 11

SALIDA: { finalAverage, approved, isComplete }
```

### 3.2 Validación del Esquema (`validateSchemePayload`)

```
1. Verificar 4 componentes exactos: DIAGNOSTICO, FK1, FK2, PARCIAL
2. No duplicados
3. minScore <= maxScore para cada componente
4. Suma de pesos (sin diagnóstico) = 100%
5. Si no cumple → BadRequestException
```

### 3.3 Reporte de Promedios (`getAdminAveragesReport`)

```
1. Obtener lista de alumnos filtrada
2. Para cada alumno, obtener TODAS sus secciones-curso
3. Para cada sección-curso, calcular promedio ponderado
4. Promedio general = media aritmética de todos los promedios por curso
5. Aprobado = promedio general >= 11
```

---

## 4. Reasignación de Alumnos

### 4.1 Opciones de Reasignación (`listReassignmentOptions`)

**Ubicación:** `sections.service.ts` L741-910

```
ENTRADA: studentId, fromSectionCourseId

1. Obtener contexto del alumno:
   - Curso, facultad, campus de la sección-curso origen

2. Buscar candidatos de destino:
   - Mismo curso
   - Misma facultad (o compatible)
   - Diferente sección-curso

3. Para cada candidato:
   - projectedStudents = assignedCount + 1
   - Calcular capacidad real (según aula)
   - overCapacity = projectedStudents > capacidad real
   - createsConflict = verificar si crea conflicto de horario

SALIDA: AdminReassignmentOption[] con flags overCapacity y createsConflict
```

### 4.2 Ejecutar Reasignación (`reassignStudentSectionCourse`)

**Ubicación:** `sections.service.ts` L912-1061

```
1. Verificar que el alumno está en la sección-curso origen
2. Verificar que la sección-curso destino existe
3. Si confirmOverCapacity no está set y hay sobrecapacidad → ERROR
4. DELETE section_student_courses WHERE studentId AND sectionCourseId = origen
5. INSERT section_student_courses (destino)
6. Registrar cambio con reason y changedBy
```

---

## 5. Control de Asistencia

### 5.1 Creación de Sesión (`createSession`)

```
1. Validar scheduleBlockId existe
2. Resolver sectionCourseId del bloque
3. Validar fecha:
   - toIsoDateOnly(): normalizar a YYYY-MM-DD
   - assertTeacherCanEditDateOrThrow():
     * today = fecha del servidor
     * yesterday = today - 1 día  
     * La fecha debe ser hoy o ayer
4. Verificar no duplicar sesión (bloque + fecha = UNIQUE)
5. INSERT attendance_session
6. Pre-cargar alumnos matriculados en la sección-curso
7. Crear registros en blanco (status = null inicialmente)
```

### 5.2 Actualización de Registros (`updateRecords`)

```
Para cada {studentId, status, notes}:
1. Verificar que el alumno está matriculado en la sección-curso
2. UPSERT attendance_record:
   - Si existe → UPDATE status, notes
   - Si no → INSERT
3. Validar status ∈ {ASISTIO, FALTO}
```

---

## 6. Propagación Masiva (Mother Section Pattern)

### 6.1 Propagación de Docente (`bulkApplyCourseTeacherFromMother`)

**Ubicación:** `sections.service.ts` L1379-1487

```
1. Resolver "sección madre" (resolveMotherAndSiblings):
   - Buscar secciones del mismo scope (facultyGroup × campus × curso × modalidad)
   - La que tenga docente asignado en section_course_teachers → madre
   - Las demás → hermanas

2. Para cada hermana que NO tenga docente:
   - Copiar la asignación de section_course_teachers de la madre
   - Verificar que no cree conflicto de horario para el docente
   - Si conflicto → saltar (no propagar a esa hermana)
```

### 6.2 Propagación de Horario (`bulkApplyCourseScheduleFromMother`)

**Ubicación:** `sections.service.ts` L1489-1673

```
1. Resolver sección madre y hermanas
2. Obtener bloques horarios de la madre para el curso
3. Para cada hermana:
   - Eliminar bloques existentes del curso
   - Copiar bloques de la madre:
     * Mismo día, misma hora
     * Nuevo UUID para cada bloque
     * Heredar zoomUrl, location, referenceModality, referenceClassroom
   - Verificar conflictos de docente y aula
```

---

## 7. Resumen de Complejidad

| Algoritmo | Complejidad | Líneas | Archivo |
|-----------|-------------|--------|---------|
| parseExcel | O(n·m) | ~225 | leveling.service.ts |
| buildCourseGroupUnits | O(n·c) | ~108 | leveling.service.ts |
| buildSectionsFromGroupUnits | O(n·s·c) | ~285 | leveling.service.ts |
| assignRowStudentCourses | O(c·n·s) | ~208 | leveling.service.ts |
| matriculateRun | O(d·s·b) | ~582 | leveling.service.ts |
| expandOfferForAppend | O(d·s) | ~483 | leveling.service.ts |
| listScheduleConflicts | O(n²·b²) | ~154 | sections.service.ts |
| computeFinalAverage | O(c) | ~17 | grades.service.ts |

Donde:
- `n` = número de alumnos
- `m` = número de columnas
- `c` = número de cursos
- `s` = número de secciones
- `d` = número de demandas
- `b` = número de bloques horarios
