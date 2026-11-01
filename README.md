# ORLANDO AI — Asistente académico para docentes

Aplicación web con interfaz HTML/CSS/JavaScript, Firebase Authentication + Firestore y backend Node.js para Gemini. El servidor verifica los tokens de Firebase con certificados públicos de Google, sin archivo JSON de cuenta de servicio. Preparada para GitHub y Render como **Web Service**.

## Incluye en esta versión

- Registro, inicio de sesión y recuperación de contraseña con Firebase Authentication.
- Crear varios colegios por cuenta.
- Datos, mensajes y memoria separados por colegio bajo `users/{uid}/schools/{schoolId}`.
- Chat con Gemini que recibe solo el contexto del colegio abierto.
- Extracción de hechos escolares a registros (asistencia, tareas, calificaciones, conducta y notas).
- Historial consultable y resumen por estudiante.
- Generación de actividades y exportación a Word y PDF.
- Configuración de escala de calificaciones por colegio.
- Verificación del token Firebase en el servidor y limitación básica de solicitudes.

## Antes de publicar

1. **Rota/revoca las claves de Gemini que hayas compartido** y crea una nueva.
2. En Firebase Console, verifica que Authentication tenga habilitado el proveedor **Correo electrónico/Contraseña**.
3. En Firestore, publica el contenido de `firestore.rules` (si coincide con tu esquema actual). Haz una copia de tus reglas antes de reemplazarlas.
4. Crea el repositorio GitHub y sube todos los archivos de esta carpeta.

## Render

Crear un **Web Service** conectado al repositorio.

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`

Variables de entorno en Render:
- `GEMINI_API_KEY`: tu nueva clave de Gemini.
- `GEMINI_MODEL`: `gemini-2.5-flash` (puedes cambiarlo por un modelo habilitado en tu proyecto).
- `NODE_VERSION`: opcional, `20` o superior.

No coloques secretos en `public/firebase.js`, `index.html` ni GitHub. Solo la clave de Gemini debe mantenerse privada en Render.

## Firebase: estructura de datos

- `users/{uid}/schools/{schoolId}`
- `users/{uid}/schools/{schoolId}/records/{recordId}`
- `users/{uid}/schools/{schoolId}/messages/{messageId}`

Las reglas incluidas permiten al usuario autenticado acceder solo a `users/{su propio uid}/...`. La API verifica el ID token de Firebase mediante los certificados públicos de Google antes de llamar a Gemini. No se necesita JSON de cuenta de servicio ni credenciales privadas de Firebase Admin.

## Prueba local

Requiere Node.js 20 o superior.

```bash
npm install
# configura las variables de entorno del .env local (no subirlo)
npm start
```

Abre `http://localhost:10000`.

## Limitaciones que debes conocer

- La IA puede interpretar mal una frase. Revisa la memoria escolar después de registrar hechos.
- El resumen calcula un promedio simple orientativo de las notas numéricas guardadas; todavía no implementa ponderaciones, rúbricas, periodos lectivos ni cierre oficial de actas.
- La memoria enviada al chat está limitada a los últimos 200 registros cargados y 12 mensajes recientes. La pestaña Memoria permite consultar hasta 250 registros; para años completos conviene implementar búsqueda paginada.
- La generación Word/PDF usa librerías CDN y requiere conexión a Internet.
- No se incluyen todavía importación masiva desde Excel, roles de director/coordinador, permisos entre profesores de un mismo colegio, ni copias de seguridad automáticas.
- Esta es una primera versión funcional para pruebas, no un sistema escolar certificado. Prueba con datos ficticios antes de cargar información real de menores.

## Privacidad

Los datos académicos de menores son sensibles. Limita el acceso a docentes autorizados, evita compartir cuentas, configura reglas estrictas, revisa los permisos y cumple las normas de protección de datos aplicables. No uses datos reales de estudiantes durante las primeras pruebas.
