# Documentación del Sistema: UAI - Horario y Asistencia

Este documento proporciona una visión general del sistema de Horario y Asistencia para los cursos de nivelación de la UAI. El sistema está diseñado para gestionar el proceso de matricula, la programación de horarios y el seguimiento de asistencia tanto para alumnos como para docentes.

---

## 1. Descripción General
El sistema es una plataforma integral desarrollada para centralizar la gestión académica de los cursos de nivelación. Permite a los administradores configurar periodos académicos, aulas y secciones; a los docentes registrar y consultar asistencias; y a los alumnos visualizar sus horarios y estado de asistencia.

---

## 2. Funcionalidades Principales

### Gestión de Periodos y Aulas
- Configuración de periodos académicos activos.
- Gestión de aulas físicas y virtuales con capacidades específicas.

### Sistema de Horarios (Scheduling)
- Programación de bloques horarios para cada sección.
- Herramientas para la detección de conflictos de horario entre docentes y aulas.
- Exportación de asignaciones y horarios para coordinación académica.

### Matrícula y Nivelación
- Procesamiento de alumnos para cursos de nivelación.
- Gestión de inscripciones (enrollments) por sección.

### Control de Asistencia
- Registro de asistencia por parte del docente desde su panel.
- Consulta de historial de asistencia para alumnos.
- Reportes consolidados de asistencia por programa y resúmenes generales para el administrador.

---

## 3. Roles de Usuario

### Administrador
- Acceso total al dashboard de gestión.
- Configuración de infraestructura (Aulas, Periodos, Secciones).
- Gestión de maestros y alumnos.
- Generación de reportes de cumplimiento y asistencia.

### Docente
- Consulta de su horario personal.
- Registro de asistencia en tiempo real para sus secciones asignadas.
- Visualización de la lista de alumnos por sección.

### Alumno
- Visualización de su horario de clases.
- Seguimiento personal de su estado de asistencia.

---

## 4. Arquitectura Técnica

El proyecto utiliza una arquitectura de **Monorepo** basada en **Nx**, lo que permite compartir tipos y lógica entre el frontend y el backend de manera eficiente.

### Tecnologías Core
- **Nx Monorepo**: Orquestador de la estructura del proyecto.
- **Backend**: NestJS (Framework de Node.js) con TypeORM.
- **Frontend**: Angular (Framework SPA) con Tailwind CSS para el diseño.
- **Base de Datos**: MySQL.
- **Infraestructura**: Docker y Docker Compose para el despliegue y desarrollo.

### Estructura de Aplicaciones
- `apps/api`: Aplicación backend (NestJS). Expone una API REST con documentación Swagger.
- `apps/web`: Aplicación frontend (Angular). Interfaz de usuario moderna y responsiva.
- `libs/shared`: Librerías de tipos (interfaces) y enumeraciones compartidas.

---

## 5. Acceso al Sistema

### Entornos de Desarrollo
- **Web (Local)**: `http://localhost:4200`
- **API (Swagger)**: `http://localhost:3000/docs`
- **Adminer (Gestión DB)**: `http://localhost:8080`

### Credenciales Initiales
- **ADMIN**: 
  - Usuario: `administrador`
  - Password: `Admin@UAI19`

### Reglas de Login
- **Alumnos**: Usuario = Código de Alumno | Password = DNI.
- **Docentes**: Usuario = DNI | Password = DNI.
- **Administradores**: Usuario = `administrador` | Password = `Admin@UAI19`.

---

## 6. Mantenimiento
El sistema utiliza migraciones automáticas para la base de datos controladas por TypeORM. En el entorno de desarrollo, cualquier cambio en las entidades se refleja mediante la ejecución de:
```sh
npx nx run api:migrate
```
