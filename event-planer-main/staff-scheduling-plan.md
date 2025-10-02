# Propuesta de Implementación: Generación de Horarios de Staff

Este documento describe el plan para construir un módulo dentro de **Catálogo Horario** capaz de generar horarios diarios o semanales para cada miembro del staff a partir de las tareas registradas en **Catálogo Tareas**.

## Objetivo
Asignar todas las tareas respetando ventanas de ejecución, duración, ubicación y dependencias, evitando solapamientos, minimizando tiempos muertos y previniendo inicios de turno excesivamente tempranos. También se deben bloquear las tareas ya asignadas manualmente antes de optimizar el resto.

Las prioridades de la solución, en orden estricto, serán:
1. Completar todas las tareas (principales, pre, post y concurrentes) generando automáticamente tareas de transporte cuando haya cambios de localización entre ellas.
2. Hacer los horarios lo más eficientes posible, reduciendo tiempos muertos y minimizando la cantidad y duración de transportes necesarios.
3. Empezar lo más tarde posible siempre que se cumplan los puntos anteriores, priorizando ventanas que permitan un descanso adecuado al staff.

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
- Registrar de forma explícita que la asignación manual de una tarea principal a un miembro del staff **no implica** que sus tareas vinculadas (pre, post o concurrentes) queden reservadas automáticamente para ese mismo miembro. Solo las tareas asignadas directamente a una persona son de su responsabilidad, mientras que el resto se mantendrán disponibles para ser asignadas al miembro libre más conveniente y así minimizar el tiempo total invertido por el equipo.
- Incorporar en el modelo la información logística de las ubicaciones: distancias, tiempos de desplazamiento estimados y medios de transporte disponibles (vehículos, transporte público, traslado a pie). Esta información alimentará la generación de tareas de transporte.
- Incorporar la generación automática de una **franja predefinida** por tarea vinculada (pre, post o concurrente) para limitar las selecciones manuales. Esta franja nace a partir de una ventana global `01:00-23:59` y se acota con: (a) la hora de inicio o fin de la tarea principal según corresponda, (b) la suma de las duraciones de las tareas dependientes en niveles previos y (c) la propia duración de la tarea actual. Por ejemplo, para una pretarea de nivel 3 cuya tarea principal va de 13:00 a 14:00, con pretareas de nivel 1 y 2 de 30 y 40 minutos respectivamente y duración propia de 50 minutos, la franja resultante será `01:00-11:00`. La pretarea de nivel 2 en ese escenario tendrá franja `01:00-11:50`. Para post tareas se utiliza la hora de finalización de la tarea principal como punto de partida hacia `23:59`, mientras que las tareas concurrentes heredan el inicio de la tarea principal y se extienden hasta `23:59`.
- Registrar que esta franja predefinida será la que se muestre por defecto en la interfaz para todas las pre-tareas, post-tareas y concurrentes, sirviendo como referencia visual inmediata y como límite para futuras selecciones manuales cuando esa funcionalidad se active. Cualquier cambio en la duración de la tarea principal o de una tarea vinculada recalculará automáticamente la franja base.
- Validar previamente que las ventanas y duraciones sean coherentes y que las ubicaciones existan en el catálogo.
- Incorporar en la normalización la jerarquía y reglas de dependencia por nivel: (a) una pre-tarea de nivel 1 solo podrá iniciarse cuando las pre-tareas de nivel 2 vinculadas sigan pendientes, (b) una pre-tarea de nivel 2 requiere que sus pre-tareas de nivel 3 asociadas estén finalizadas antes de comenzar, (c) una post-tarea de nivel 3 solo se habilitará tras completarse su post-tarea de nivel 2, (d) una post-tarea de nivel 2 depende de la finalización de su post-tarea de nivel 1 y (e) una post-tarea de nivel 1 exige que la tarea principal esté concluida. Las tareas concurrentes se habilitarán desde el inicio de la tarea principal vinculada y podrán finalizar en cualquier momento siempre que se respete su ventana.

### 2. Inicialización de Horarios
- Crear contenedores de horario por miembro del staff.
- Insertar bloques fijos para tareas preasignadas manualmente y marcarlas como no modificables.
- Registrar los segmentos libres restantes para futuras asignaciones.
- Guardar en cada tarea vinculada los límites de su franja predefinida para permitir selecciones manuales dentro de ese rango (por ejemplo, si la ventana resultante es `01:00-12:00`, se admitirá elegir `02:00-11:00` pero no `02:00-12:01`). Documentar que se ofrecerá un control de "acotar franja" con botones de incremento/decremento para ajustar la franja por defecto, manteniendo la validación contra los límites derivados automáticamente.
- Añadir en la documentación funcional que cada tarjeta de pre-tarea, post-tarea o tarea concurrente mostrará un botón de cierre ("X") en la esquina superior derecha para permitir su eliminación manual, el cual deberá solicitar confirmación antes de ejecutar la acción.

### 3. Algoritmo de Asignación y Optimización
- Ordenar inicialmente las tareas por criterios como fecha límite, duración, prioridad y flexibilidad.
- Detectar transiciones de localización entre tareas asignadas a un mismo miembro y generar tareas de transporte intermedias con duración según el medio elegido y las distancias registradas. Estas tareas aparecerán únicamente en el horario del staff y heredarán las restricciones necesarias para respetar el orden de ejecución.
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

### 6. Flujo operativo del generador asistido por IA
- **Normalización enriquecida de datos.** El recolector que alimenta a la IA consolida ahora la jerarquía completa de tareas (principales, pre, post y concurrentes), aplica límites derivados cuando faltan ventanas manuales y adjunta metadatos adicionales como profundidad en el árbol, nombre de la raíz y bloqueos. De este modo la IA conoce la posición exacta de cada actividad en la cadena y puede respetar su semántica temporal incluso cuando el usuario no ha fijado restricciones explícitas.
- **Contexto logístico completo.** Además de las ubicaciones con sus coordenadas, se envían los vehículos disponibles, la velocidad estimada de cada uno y una matriz de tiempos de desplazamiento entre localizaciones. El payload también incluye la localización inicial y las preferencias de arranque tanto del proyecto como del staff para facilitar decisiones tardías coherentes con la operativa.
- **Reglas explícitas de transporte.** El prompt instruye al modelo para que inserte tramos de transporte (`actionType = "TRANSPORTE"`) siempre que detecte un cambio de localización en la secuencia de tareas de un mismo miembro. Cada transporte debe declarar origen, destino, vehículo empleado y duración compatible con la matriz logística. Los transportes se consideran nuevas sesiones auxiliares y no requieren un `taskId` de catálogo.
- **Validaciones y avisos.** Si algún bloque no cabe en su ventana o falta tiempo de desplazamiento, la IA debe reportarlo en la lista de advertencias. El sistema conserva estos avisos y los muestra en el catálogo de horarios junto a métricas de huecos, transportes generados y conflictos de localización.
- **Mantenimiento de funcionalidades previas.** Las tareas bloqueadas siguen siendo inamovibles, las duraciones se respetan, y la interfaz continúa presentando los horarios del staff junto con los resúmenes globales. El refuerzo de datos y prompt actúa únicamente sobre la lógica de generación sin afectar a la edición manual existente.

## Próximos Pasos
1. Definir modelos de datos y endpoints para obtener tareas y publicar horarios.
2. Implementar la normalización de tareas y la inicialización de horarios.
3. Desarrollar la heurística inicial y la búsqueda local básica.
4. Crear reportes de métricas y validaciones de conflictos.
5. Integrar la solución y ejecutar pruebas con datos reales.
