# Solver de planificación con transportes integrados

## Objetivo
Implementar un solver capaz de generar, a partir de un único `STATE` en formato JSON, los horarios finales para cada miembro del staff incorporando los desplazamientos necesarios antes de publicar el resultado.

## Flujo general
1. Recibir un único payload `STATE` con la estructura actual (proyecto, parámetros, staff, localizaciones, vehículos, transportes y tareas).
2. Normalizar los datos de tareas y cadenas (milestones, pre, post, parallel) respetando ventanas duras, duraciones y dependencias.
   - En la normalización registrar la profundidad de cada tarea en la cadena para aplicar las reglas: las pre-tareas de nivel 1 solo quedan habilitadas mientras existan pre-tareas de nivel 2 pendientes y las de nivel 2 requieren la finalización previa de sus tareas de nivel 3; en cadenas post el orden es inverso (nivel 3 depende de nivel 2, nivel 2 de nivel 1 y nivel 1 de la tarea principal). Las tareas parallel pueden comenzar siempre que la tarea raíz esté en ejecución.
3. Calcular los desplazamientos requeridos entre localizaciones antes de fijar cada bloque de trabajo. Si `transportes.requerido` es verdadero, el solver debe:
   - Determinar el origen y destino con base en la localización actual del miembro del staff y la localización de la próxima tarea.
   - Seleccionar el vehículo indicado en la tarea o, en su defecto, el `vehiculoPorDefecto`.
   - Consultar `transportes.tiempos` para obtener la duración; si no existe un tiempo predefinido, estimar mediante distancia Haversine y la velocidad del vehículo. Si no es posible, generar una advertencia y marcar la cadena como no planificable.
   - Insertar el bloque `TRANSPORTE` inmediatamente antes del siguiente bloque de trabajo y ajustar los horarios para que el transporte concluya exactamente cuando inicia la tarea.
4. Aplicar las políticas de colocación:
   - **Cadena PRE**: planificar de forma retroactiva desde el inicio del hito raíz, incorporando transportes entre cada pareja consecutiva.
   - **Cadena POST**: planificar hacia adelante desde el fin del hito raíz, insertando los transportes previos a cada tarea subsecuente.
   - **PARALLEL**: ubicar alrededor del hito raíz minimizando huecos y respetando transportes necesarios.
5. Realizar la compactación respetando ventanas y dependencias, garantizando que los transportes permanezcan pegados al bloque al que sirven.
6. Validar que no existan solapamientos, que todos los transportes cuentan con duración válida y que las dependencias cumplen `fin(predecesora) + travel ≤ inicio(sucesora)`.

## Salida requerida
El solver debe responder **únicamente** con el siguiente JSON:
```json
{
  "staff": [
    {
      "staffId": "ID",
      "sessions": [
        { "taskId": "TASK_ID", "start": "HH:MM", "end": "HH:MM" },
        { "actionType": "TRANSPORTE", "vehiculoId": "V_ID", "originId": "L_A", "destinationId": "L_B", "start": "HH:MM", "end": "HH:MM" }
      ]
    }
  ],
  "warnings": ["..."]
}
```
- Formato horario 24h `HH:MM`, alineado con la fecha y zona horaria del proyecto.
- Sesiones ordenadas cronológicamente para cada miembro, incluyendo transportes integrados.
- Lista de advertencias con conflictos de ventanas, dependencias o transportes imposibles.

## Reglas duras
- Respetar `inicioFijo`, `finFijo` y la localización indicada en cada tarea.
- No modificar `duracionMin` ni ignorar ventanas (`ventana.original` o `ventana.derivada`).
- Evitar solapamientos por persona entre tareas y transportes.
- Si la primera tarea del miembro requiere desplazamiento desde su localización inicial, generar el transporte correspondiente antes de programarla.
- No programar antes de `proyecto.inicioDia` salvo que la ventana lo permita explícitamente.

## Advertencias obligatorias
- Transportes sin duración válida o sin ruta estimable.
- Cadenas que no caben en sus ventanas pese a los ajustes.
- Dependencias que violen `fin + transporte ≤ inicio`.

Estas reglas aseguran que los transportes formen parte integral de la planificación en lugar de añadirse como un post-proceso, cumpliendo con el requerimiento de entregar únicamente el horario final y las advertencias calculadas por el solver.
