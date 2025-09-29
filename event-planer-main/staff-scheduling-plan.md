# Propuesta de Implementación: Generación de Horarios de Staff

Este documento describe el plan para construir un módulo dentro de **Catálogo Horario** capaz de generar horarios diarios o semanales para cada miembro del staff a partir de las tareas registradas en **Catálogo Tareas**.

## Objetivo
Asignar todas las tareas respetando ventanas de ejecución, duración, ubicación y dependencias, evitando solapamientos, minimizando tiempos muertos y previniendo inicios de turno excesivamente tempranos. También se deben bloquear las tareas ya asignadas manualmente antes de optimizar el resto.

## Enfoque General
1. Consolidar tareas principales, pre-tareas, post-tareas y concurrentes en un modelo uniforme.
2. Inicializar calendarios por miembro bloqueando tareas preasignadas.
3. Aplicar un algoritmo de optimización híbrido (heurística + búsqueda local) que respete restricciones y minimice huecos.
4. Evaluar la eficiencia de cada horario y realizar ajustes iterativos.
5. Validar la solución final y publicarla para el resto del sistema.

## Detalle de la Solución

### 1. Consolidación de Datos
- Construir un agregador que recoja todas las tareas relacionadas con cada cliente.
- Normalizar cada tarea con campos como `id`, `tipo`, `cliente`, `miembroPreasignado`, `ventanaInicio`, `ventanaFin`, `duracion`, `ubicacion`, `dependencias`, `prioridad`, `flexibilidad` y `estado`.
- Validar previamente que las ventanas y duraciones sean coherentes y que las ubicaciones existan en el catálogo.

### 2. Inicialización de Horarios
- Crear contenedores de horario por miembro del staff.
- Insertar bloques fijos para tareas preasignadas manualmente y marcarlas como no modificables.
- Registrar los segmentos libres restantes para futuras asignaciones.

### 3. Algoritmo de Asignación y Optimización
- Ordenar inicialmente las tareas por criterios como fecha límite, duración, prioridad y flexibilidad.
- Asignar heurísticamente buscando ventanas compatibles, penalizando huecos grandes, traslados extensos y comienzos demasiado tempranos.
- Cumplir dependencias entre pre-tareas, tareas principales, post-tareas y tareas concurrentes.
- Ejecutar una búsqueda local para intercambiar o reubicar tareas y reducir huecos.

### 4. Evaluación y Validación
- Calcular métricas de inicio y fin por miembro, cantidad de huecos, cumplimiento de ventanas y equilibrio de carga.
- Detectar y corregir conflictos como solapamientos, dependencias incumplidas o tareas sin asignar.

### 5. Salida y Publicación
- Persistir los horarios en la base de datos de Catálogo Horario y exponerlos mediante APIs o vistas.
- Guardar historial de versiones para auditoría y posibles ajustes manuales.

## Consideraciones Adicionales
- Permitir re-ejecuciones parciales por cliente o rango de fechas.
- Exponer parámetros configurables (umbral de inicio temprano, pesos de penalización, límites de tiempo de optimización).
- Entregar siempre la mejor solución factible, documentando las tareas no asignadas cuando existan.

## Próximos Pasos
1. Definir modelos de datos y endpoints para obtener tareas y publicar horarios.
2. Implementar la normalización de tareas y la inicialización de horarios.
3. Desarrollar la heurística inicial y la búsqueda local básica.
4. Crear reportes de métricas y validaciones de conflictos.
5. Integrar la solución y ejecutar pruebas con datos reales.
