# Especificacion Aterrizada - Modelo de Aulas y Capacidad Fisica (UAI)

Fecha: 2026-02-22
Estado: Aprobado para diseno funcional (pendiente implementacion tecnica)

## 1) Objetivo

Alinear matricula presencial con capacidad fisica real.

Regla central:
- La capacidad presencial no se toma de un aforo global en Nivelacion.
- La capacidad presencial se toma del aula asignada a cada seccion-curso.

## 2) Decisiones cerradas (acordadas)

1. Las aulas son por sede.
2. Una misma aula puede usarse varias veces el mismo dia, siempre que no exista cruce horario.
3. Una seccion-curso puede tener un conjunto de franjas horarias (varios bloques semanales).
4. El alumno se matricula a seccion-curso (no a una franja suelta).
5. Si una seccion-curso tiene varias franjas, el alumno lleva todas esas franjas.
6. Docente y alumnos viven en seccion-curso.
7. Virtual queda ilimitado por ahora (con opcion futura de cupo logico).
8. Si se cambia de aula y ya hay alumnos, el nuevo aforo debe ser >= matriculados actuales de esa seccion-curso.

## 3) Modelo funcional resultante

## 3.1 Catalogo de aulas por sede

Nueva entidad/logica operativa: Aula

Campos minimos:
- id
- sedeId
- codigo
- nombre
- aforo
- tipo (AULA | LABORATORIO | AUDITORIO)
- estado (ACTIVA | INACTIVA)
- observacion (opcional)

Reglas:
- (sedeId + codigo) unico.
- Solo aulas activas se pueden asignar.

## 3.2 Seccion-curso (sin romper modelo actual)

Se mantiene como unidad academica principal para:
- Matricula de alumnos
- Asignacion de docente
- Asignacion de horarios (conjunto de franjas)

Cambio clave:
- Para modalidad PRESENCIAL, se asigna un aula a la seccion-curso.
- Capacidad real presencial = aforo del aula asignada.

Nota:
- No se introduce matricula por franja ni por sesion separada en esta etapa.
- Se conserva compatibilidad con la estructura actual.

## 4) Reglas obligatorias de validacion

## 4.1 Cruce de aula

No se puede guardar horario presencial si existe otra seccion-curso activa con:
- misma aula
- mismo sede/contexto
- cruce de horario

Resultado: bloqueo de guardado.

## 4.2 Cruce de docente

No se puede guardar horario si el docente ya dicta otra seccion-curso en horario cruzado.

Resultado: bloqueo de guardado.

## 4.3 Cambio de aula con alumnos matriculados

Si matriculadosActuales > aforoNuevaAula:
- bloquear cambio
- mensaje claro: "No se puede cambiar a esa aula porque su aforo es menor a los matriculados actuales."

## 4.4 Habilitacion para matricula presencial

Una seccion-curso presencial queda habilitada solo si:
- tiene docente asignado
- tiene al menos una franja horaria
- tiene aula asignada
- no tiene conflictos de aula/docente

Si no cumple, no debe entrar como candidata en matricula presencial.

## 5) Integracion con Nivelacion

Nivelacion se mantiene.

Cambio semantico:
- El valor de aforo en Nivelacion pasa a ser "tamano objetivo de planificacion".
- No es limite fisico real de matricula presencial.

Regla de seguridad recomendada:
- Si el aforo objetivo supera la capacidad fisica maxima de aulas disponibles de la sede, advertir y ajustar en previsualizacion.

## 6) Logica de matricula

Para cursos presenciales:
1. Buscar secciones-curso candidatas (misma facultad/sede/curso/modalidad segun reglas vigentes).
2. Calcular disponible real por seccion-curso:
   - disponible = aforoAulaAsignada - matriculadosActuales
3. Priorizar:
   - reuso de secciones-curso existentes con cupo
   - luego creacion de nueva oferta si falta capacidad
4. Si no hay capacidad fisica:
   - dejar no asignados con motivo "Sin capacidad fisica disponible"

Para virtual:
- ilimitado por ahora (sin bloqueo por aforo).

## 7) UX esperada

## 7.1 Horarios y Docentes

Agregar/mostrar columnas:
- Aula
- Aforo aula
- Matriculados
- Disponibles

Acciones:
- Asignar/editar aula
- Asignar/editar horario
- Asignar/editar docente

## 7.2 Matricula (previsualizacion)

Mostrar por seccion-curso:
- Aforo real (aula)
- Matriculados
- Disponibles
- No asignados con motivo

## 8) Ejemplos operativos

## Ejemplo A

Demanda: 60 alumnos, curso Comunicacion, sede Chincha.
Aulas disponibles: 38 y 39.

Asignacion valida:
- APS-CH -> 38
- BPS-CH -> 22

No hay sobreaforo.

## Ejemplo B

APS-IC tiene aula de 39 y ya 15 matriculados.
Llegan 50 nuevos del mismo curso.

Capacidad libre APS-IC = 24.
- Van 24 a APS-IC.
- Restan 26 -> nueva seccion-curso con otra aula.

## Ejemplo C (cambio de aula)

Seccion-curso con 34 matriculados.
Se intenta cambiar a aula aforo 32.

Resultado:
- bloqueo (no permitido).

## 9) Plan de implementacion por fases

## Fase 1 (prioridad alta)

- Catalogo de aulas por sede.
- Asignacion de aula en seccion-curso presencial.
- Validacion de cruces de aula y docente.
- Matricula usando cupo real por aula.

## Fase 2

- Ajuste de Nivelacion para no generar planificaciones presenciales inviables.
- Indicadores de capacidad fisica en previsualizacion.

## Fase 3

- Virtual con cupo logico opcional (si se decide).
- Reporte de brecha demanda vs capacidad fisica por sede/curso.

## 10) Resultado esperado

- Coherencia entre planificacion y realidad de infraestructura.
- Menos ajustes manuales de ultimo minuto.
- Matricula incremental confiable.
- Base solida para crecimiento futuro sin romper el flujo actual.

---

Documento de referencia para validacion funcional final antes de implementacion tecnica.
