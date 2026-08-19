# Setup WhatsApp Business API (Meta Cloud API) para Cuidy

## Paso 1: Crear cuenta en Meta Business Suite

1. Ir a [business.facebook.com](https://business.facebook.com) y loguearse con la cuenta de Facebook/Meta
2. Crear un "Business Portfolio" (si no tenés uno): nombre "Cuidy"
3. Ir a [developers.facebook.com](https://developers.facebook.com) → "My Apps" → "Create App"
4. Elegir tipo: **Business** → nombre: "Cuidy WhatsApp"
5. En el dashboard de la app, buscar **WhatsApp** → "Set Up"

## Paso 2: Configurar WhatsApp Business

1. En la sección WhatsApp de tu app, vas a ver un **Phone Number ID** de prueba y un **Temporary Access Token**
2. Para pruebas iniciales, usá esos datos temporales
3. Para producción:
   - Ir a WhatsApp → Getting Started → agregar tu número de teléfono real
   - Verificar el número con código SMS
   - Generar un **Permanent Access Token** desde System Users en Business Settings

## Paso 3: Variables de entorno en Netlify

Agregar en Netlify → Site Settings → Environment Variables:

```
WA_PHONE_ID=<tu Phone Number ID>
WA_TOKEN=<tu Access Token>
```

## Paso 4: Verificar funcionamiento

Con las variables configuradas, el sistema enviará WhatsApp automáticamente.
Sin las variables, el sistema funciona en **modo simulado** (logs en consola, sin envío real).

## Notificaciones configuradas

### Por WhatsApp (urgentes):
- Nueva solicitud de contacto → al cuidador
- Cuidador aceptó/rechazó solicitud → a la familia
- Completar perfil tras aprobación → al cuidador
- Confirmación de entrevista + reminder 1h antes → al cuidador
- Código OTP de verificación de teléfono → al registrarse

### Por Email (formales):
- Confirmación de registro del cuidador
- Bienvenida post-pago a la familia
- Agenda de entrevista (para calendar)
- Activación de cuenta admin
- Respuesta de solicitud (respaldo del WhatsApp)

## Costos

- **Primeras 1,000 conversaciones/mes**: GRATIS
- Después: ~USD 0.03-0.05 por conversación (varía por país)
- Una "conversación" = 24h de mensajes con un mismo número

## Notas técnicas

- Los mensajes de texto libre (no templates) solo se pueden enviar dentro de una ventana de 24h desde que el usuario interactúa
- El OTP cuenta como mensaje de autenticación y no requiere ventana previa
- Para mensajes fuera de ventana de 24h (ej: recordatorio de entrevista), se necesitan templates pre-aprobados por Meta
- Los templates se crean desde WhatsApp Manager en Meta Business Suite
