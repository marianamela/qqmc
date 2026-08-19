# Cuidy — Sistema Anti-fraude en Recomendaciones

## Contexto

El flujo de recomendación rápida (`recomendar-cuidador.html` → `POST /recomendaciones/rapida`) permite que cualquier persona recomiende a un cuidador sin necesidad de tener cuenta en Cuidy. Esto es clave para la campaña de lanzamiento #CuidarBien, pero abre la puerta a fraudes: auto-recomendaciones, recomendaciones de familiares, o recomendaciones masivas falsas.

Para mitigar estos riesgos se implementaron 4 capas de protección que funcionan en conjunto.

---

## Capa 1 — Verificación OTP de WhatsApp

Antes de enviar una recomendación, quien recomienda debe verificar su número de WhatsApp con un código OTP de 6 dígitos. Esto garantiza que el teléfono es real y está en posesión de quien recomienda.

**Qué previene:** recomendaciones con datos inventados, bots, formularios automáticos.

**Implementación:**
- Frontend: campo OTP inline en el formulario de recomendación (`recomendar-cuidador.html`)
- Backend: reutiliza los endpoints existentes `POST /auth/otp-send` y `POST /auth/otp-verify`
- El formulario no se puede enviar sin que `fam_telefono_verificado` tenga un valor (el teléfono normalizado devuelto por el OTP)
- Se guarda `telefono_verificado: true` en la tabla `invitaciones`

---

## Capa 2 — Cruce de teléfonos

Validaciones duras en el backend que bloquean la recomendación inmediatamente si se detecta un patrón obvio de fraude.

### 2a. Teléfono familia ≠ teléfono cuidador
Si el teléfono de quien recomienda es igual al del cuidador, se rechaza. Previene la forma más básica de auto-recomendación.

### 2b. Teléfono de familia no registrado como cuidador
Se cruza el teléfono de quien recomienda contra la tabla `cuidadores`. Si el teléfono ya está registrado como cuidador, se rechaza con el mensaje: *"Este WhatsApp está registrado como cuidador. Solo familias pueden recomendar."*

### 2c. Límite de recomendaciones por teléfono
Máximo **5 recomendaciones activas** por número de teléfono (excluyendo las expiradas). Después de 5, se le sugiere crear una cuenta. Este es un límite duro que no depende del scoring.

### 2d. Duplicado
Si el mismo teléfono de familia ya recomendó al mismo teléfono de cuidador y la recomendación no está expirada, se rechaza.

---

## Capa 3 — Preguntas de contexto

El formulario incluye 3 preguntas obligatorias sobre la relación entre quien recomienda y el cuidador:

| Campo | Opciones | Columna en DB |
|-------|----------|---------------|
| Tipo de servicio | Niñera, Adulto mayor, Doméstica, Cocinera, Otro | `tipo_servicio` |
| Duración de la relación | Menos de 6 meses, 6m-1 año, 1-3 años, Más de 3 años | `duracion_relacion` |
| ¿Actualmente trabaja con vos? | Sí / No | `actualmente_trabaja` |

**Qué previene:** agrega fricción a las recomendaciones falsas (hay que inventar respuestas coherentes) y genera datos para detectar patrones sospechosos. Además, una relación menor a 6 meses suma puntos al scoring de fraude.

---

## Capa 4 — Scoring anti-fraude automático

Cada recomendación recibe un puntaje de riesgo (`fraud_score`, de 0 a 100) calculado en base a 7 señales. Si el score alcanza **30 o más**, la recomendación queda en estado `revision_pendiente` y **no se envía** el WhatsApp al cuidador hasta que un administrador la apruebe manualmente.

### Señales y puntajes

| Señal | Puntos | Flag | Descripción |
|-------|--------|------|-------------|
| Prefijo telefónico similar | +15 | `prefijo_telefonico_similar` | Los primeros 7 dígitos del teléfono de la familia y del cuidador coinciden (misma zona + operador) |
| Números consecutivos | +25 | `numeros_consecutivos` | Los últimos 4 dígitos de ambos teléfonos difieren en menos de 10 |
| Apellido compartido | +30 | `apellido_compartido` | La última palabra del nombre de la familia y del cuidador es idéntica (y tiene más de 2 caracteres) |
| Email temporal | +35 | `email_temporal` | El dominio del email está en una lista de servicios de email descartable (mailinator, yopmail, guerrillamail, etc.) |
| Múltiples recs misma IP | +20 | `multiples_recs_misma_ip` | 3 o más recomendaciones desde la misma IP en las últimas 24 horas |
| Relación muy corta | +10 | `relacion_muy_corta` | La duración de la relación es "menos de 6 meses" |
| Nombre cuidador no coincide | +15 | `nombre_cuidador_no_coincide` | El cuidador ya está registrado en la plataforma pero con un nombre diferente al de la recomendación |

### Umbral de revisión

**fraud_score ≥ 30** → estado `revision_pendiente`, no se envía WhatsApp al cuidador.

**fraud_score < 30** → estado `enviada`, se envía WhatsApp normalmente.

### Ejemplos de combinaciones

| Escenario | Señales | Score | Resultado |
|-----------|---------|-------|-----------|
| Recomendación limpia, primera vez, zona diferente | ninguna | 0 | Enviada |
| Misma zona telefónica, relación corta | prefijo + corta | 25 | Enviada |
| Mismo apellido | apellido | 30 | **Revisión** |
| 3ra recomendación del día + misma zona | IP + prefijo | 35 | **Revisión** |
| Email temporal | email_temporal | 35 | **Revisión** |
| Números consecutivos + relación corta | consecutivos + corta | 35 | **Revisión** |
| Recomendación limpia, 3ra del día desde misma IP | IP | 20 | Enviada |

### Capacidad por persona

Una persona completamente limpia (sin ningún flag) puede hacer hasta **5 recomendaciones** sin problemas (límite duro de Capa 2c). A partir de la 3ra recomendación en 24 horas suma +20 por IP, pero eso solo no alcanza el umbral de 30. Sin embargo, si cualquier otra señal se activa (por ejemplo, comparte zona telefónica con algún cuidador), la 3ra recomendación ya queda retenida para revisión.

---

## Datos almacenados

Todas las señales se guardan en la tabla `invitaciones`:

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `tipo_servicio` | TEXT | Tipo de servicio seleccionado |
| `duracion_relacion` | TEXT | Duración de la relación laboral |
| `actualmente_trabaja` | BOOLEAN | Si el cuidador trabaja actualmente con quien recomienda |
| `telefono_verificado` | BOOLEAN | Si el teléfono fue verificado por OTP |
| `fraud_score` | INTEGER | Puntaje de riesgo (0-100) |
| `fraud_flags` | JSONB | Array con los flags activados |
| `ip_origen` | TEXT | IP desde donde se envió |
| `requiere_revision` | BOOLEAN | Si necesita revisión manual |

---

## Migration SQL

El archivo `sql/migration-antifraude-recomendaciones.sql` contiene todos los ALTER TABLE necesarios. Debe ejecutarse en Supabase antes de deployar los cambios.

---

## Archivos involucrados

| Archivo | Cambios |
|---------|---------|
| `client/recomendar-cuidador.html` | OTP inline, preguntas de contexto, validaciones frontend |
| `netlify/functions/api.js` | Validaciones Capa 2, scoring Capa 4, estado `revision_pendiente` |
| `sql/migration-antifraude-recomendaciones.sql` | Nuevas columnas e índices en `invitaciones` |

---

## Posibles mejoras futuras

- **Capa 5 — Verificación de identidad del que recomienda**: Pedir DNI + selfie a quien recomienda, igual que a las familias registradas. Máxima seguridad pero mayor fricción.
- **Dashboard admin de revisión**: Panel para que los admins vean las recomendaciones en `revision_pendiente`, con el detalle de flags y la opción de aprobar o rechazar.
- **Machine learning**: Con suficientes datos, entrenar un modelo que detecte patrones más sutiles.
- **Rate limiting por device fingerprint**: Complementar el control por IP con fingerprinting del dispositivo.
- **Verificación cruzada post-registro**: Una vez que el cuidador se registra, pedirle que confirme que conoce a la familia que lo recomendó.
