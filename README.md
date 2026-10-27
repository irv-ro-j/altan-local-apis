# Altán Local APIs

Simulador de Altán y Conecty para integrar el CRM sin realizar transacciones reales. Admite persistencia compartida en DynamoDB y un modo descartable en memoria.

## Arranque

```bash
pnpm dev
```

El portal y la API quedan disponibles en `http://localhost:3000`.

## Persistencia en DynamoDB

La tabla `altan-local-apis` está en `us-east-2` (Ohio), con capacidad provisionada de 5 RCU y 5 WCU. La infraestructura reproducible y los permisos están en [`infra/storage.yaml`](infra/storage.yaml); consulta [`infra/README.md`](infra/README.md) para configurar otra cuenta o entorno.

Para usar la tabla desde tu equipo, copia `.env.example` a `.env` y utiliza el perfil AWS `altan-local-apis` configurado con el rol de desarrollo. No se guardan claves AWS en el repositorio. El namespace local es `local`; la rama `master` de Amplify utiliza `default`, de modo que reiniciar pruebas locales no borra los datos remotos.

| Variable | Valor |
| --- | --- |
| `MOCK_STORAGE` | `dynamodb` para persistir; `memory` para pruebas descartables |
| `DYNAMODB_TABLE` | `altan-local-apis` |
| `DYNAMODB_REGION` | `us-east-2` |
| `MOCK_NAMESPACE` | `local` en desarrollo; `default` en Amplify |
| `AWS_PROFILE` | `altan-local-apis`, solamente en el equipo local |

Amplify obtiene permisos del rol SSR Compute de la rama, sin claves estáticas. Las variables anteriores se leen durante el build; Nitro también admite los overrides de runtime `NUXT_MOCK_STORAGE`, `NUXT_DYNAMODB_TABLE`, `NUXT_DYNAMODB_REGION` y `NUXT_MOCK_NAMESPACE`. Los permisos y variables de Amplify pueden configurarse antes del despliegue; el cambio de memoria a DynamoDB se activa al desplegar este código.

Cada SIM y venta se guarda individualmente. Las actualizaciones usan versiones y transacciones para evitar perder recargas concurrentes; la portabilidad mueve el registro entre números de forma atómica. Las ventas Conecty conservan la idempotencia de `sale_identifier` incluso entre instancias.

Las fixtures se crean una sola vez por namespace. Reiniciar o desplegar no borra datos ni recrea una SIM cuyo número ya fue portado. `POST /api/mock/reset` cambia atómicamente a fixtures nuevas y borra SIM manuales, ventas y referencias de idempotencia del namespace actual. DynamoDB nunca hace fallback silencioso a memoria ante errores de conexión o permisos. `GET /api/mock/health` comprueba la conexión y devuelve el backend activo en `storage`.

Pruebas sin AWS: `pnpm test`. Prueba de integración con la tabla real, después de `pnpm build`:

```powershell
$env:AWS_PROFILE = 'altan-local-apis'
$env:TEST_DYNAMODB_TABLE = 'altan-local-apis'
pnpm test:persistence
```

La prueba real usa un namespace `qa-smoke-<uuid>`, arranca dos procesos sucesivos, verifica persistencia y concurrencia y elimina sus propios registros al terminar. No resetea `default` ni `local`.

## Endpoints compatibles

| Operación | Método | Ruta |
| --- | --- | --- |
| Token | POST | `/v1/oauth/accesstoken` |
| Perfil | GET | `/cm/v1/subscribers/{msisdn}/profile` |
| Vinculación CRT | POST | `/cm/v1/subscribers/links` |
| Activación | POST | `/cm/v1/subscribers/{msisdn}/activate` |
| Preactivación | POST | `/cm/v1/subscribers/{msisdn}/preregistered` |
| Compra/recarga | POST | `/cm/v1/products/purchase` |
| Cambio de plan | PATCH | `/cm/v1/subscribers/{msisdn}` |
| Portabilidad entrante | POST | `/ac/v1/msisdns/port-in-c` |

El endpoint de token exige Basic Auth correcto. Las rutas operativas exigen el Bearer emitido. Copia `.env.example` a `.env` para cambiar los valores; si no existe `.env`, los valores predeterminados son `local-crm`, `local-secret-change-me` y `local-altan-access-token`.

### Portabilidad entrante

`POST /ac/v1/msisdns/port-in-c` recibe `msisdnTransitory` y `msisdnPorted` como cadenas de diez dígitos. Si la operación se acepta, responde HTTP `200` con `msisdnPorted` y `effectiveDate`, y mueve la SIM activa al número portado. Los errores de validación, conflicto o estado de SIM responden con su código HTTP y un objeto JSON `{ "errorCode": "...", "message": "..." }`. Esto permite que el CRM guarde la respuesta y el detalle en los campos JSON `response_data` y `response_errors` de `RequestLog`.

Los números `5511119999` y `5599991111` en `msisdnTransitory` mantienen los escenarios controlados de error `400` y `500`. Una SIM transitoria no activa o un número portado ya ocupado produce un error JSON `409`.

### Consulta de vinculación CRT

`POST /cm/v1/subscribers/links` requiere Bearer Auth y recibe `{ "msisdn": "5550000002" }`. Devuelve HTTP `200` con `{ "isCrtLinked": true|false }`. El valor proviene de la SIM mock y no modifica el estado ni la respuesta del endpoint de perfil; el CRM puede consultar esta operación de forma independiente.

Un MSISDN inválido responde `400`. Un suscriptor inexistente o desactivado responde `400` con `errorCode: "400"` y `detail: "The subscriber does not exist"`, para mantener la respuesta compatible con el manejo del endpoint de Altán. `5550000098` conserva el escenario de error `500`.

Cada tarjeta de SIM incluye un switch **Vinculación CRT** para vincular o desvincular la línea del simulador. El cambio se guarda en el backend configurado y se refleja en la consulta CRT, sin cambiar el estado operativo, la oferta ni las bolsas. Si falla el guardado, se conserva el valor anterior y la tarjeta muestra el error. Una SIM `Deactive` sigue respondiendo como suscriptor inexistente en la consulta de Altán, independientemente del valor del switch.

## Escenarios de SIM

| MSISDN | Estado inicial | Vinculación CRT |
| --- | --- | --- |
| `5550000001` | Idle | No vinculada |
| `5550000002` | Active | Vinculada |
| `5550000003` | Suspend (B2W) |
| `5550000004` | Suspend (B2W) (By IMEI locked) |
| `5550000005` | Suspend (B2W) (Notified by client) |
| `5550000006` | Barring (B1W) |
| `5550000007` | Barring (B1W) (By NoB28) |
| `5550000008` | Barring (B1W) (Notified by client) |
| `5550000009` | Predeactive |
| `5550000010` | Predeactivate |
| `5550000011` | Deactive |
| `5550000098` | Error 500 simulado |
| `5550000099` | Perfil inexistente (404 / `1211000305`) |

La consulta de perfil de cualquier SIM en estado `Deactive` devuelve HTTP `404` con `errorCode: "1211000305"` en la raíz del JSON. Así, el CRM obtiene `is_success = False` y entra al manejo de suscriptor inexistente o inactivo de `MSISDNProfileUseCase`. Puedes probarlo con `5550000011` o con una SIM creada manualmente en ese estado.

La consulta de perfil solo lee el estado: un MSISDN no registrado también devuelve `404` / `1211000305` y no se crea automáticamente como `Active`. El autoprovisionamiento queda reservado a las operaciones válidas del simulador.

Activación y preactivación cambian una SIM `Idle` a `Active`, asignan el plan principal y crean bolsas de 5,120 MB, 1,500 minutos y 500 SMS con vigencia de 30 días. Una compra agrega una bolsa de 1,024 MB con vigencia de 30 días. El cambio de plan reemplaza las bolsas del plan principal. Llama a `POST /api/mock/reset` para volver al estado inicial.

Con `MOCK_STORAGE=memory`, los cambios siguen siendo efímeros y se pierden al reiniciar o cambiar de instancia. En Amplify debe utilizarse `dynamodb` para compartir y conservar el estado.

## Utilidades propias del mock

- `GET /api/mock/health`
- `GET /api/mock/sims`
- `POST /api/mock/sims` acepta `isCrtLinked` (booleano opcional; predeterminado `false`) al crear SIMs manuales, para preparar escenarios vinculados y no vinculados.
- `POST /api/mock/sims/{msisdn}/crt-linkage` recibe `{ "isCrtLinked": true|false }` y devuelve `{ "msisdn": "...", "isCrtLinked": true|false }`. Solo modifica SIMs existentes; responde `400` si el número o el booleano son inválidos, `404` si la SIM no existe y `409` si se agotan los reintentos por cambios concurrentes.
- `DELETE /api/mock/sims/{msisdn}` -- elimina una SIM del namespace actual; cada tarjeta incluye esta accion con confirmacion.
- `POST /api/mock/sims/{msisdn}/consume` — consume 250 MB, 60 minutos y 20 SMS.
- `POST /api/mock/reset`

## Uso desde CRM

El CRM usa actualmente el mock remoto de Amplify para todas las operaciones
del ambiente `LOCAL`, incluida la portabilidad. Este simulador se conserva para
pruebas locales directas y para una futura migración integral; no requiere
configuración adicional en el CRM mientras se mantenga esa estrategia.

## Conecty (eSIMs de viaje)

El simulador también expone la Conecty Sales API. En el CRM, en `Integradores > Conecty`, elige el ambiente **LOCAL**, captura `LOCAL URL base` (p. ej. `http://localhost:3000`) y las credenciales de `.env` (`CONECTY_LOCAL_DOCUMENT`, `CONECTY_LOCAL_API_KEY`; por defecto `local-document` y `local-conecty-key`).

| Operación | Método | Ruta |
| --- | --- | --- |
| Login (token) | GET | `/users/login?document=` con header `x-api-key` |
| Catálogo básico | GET | `/api/packages` |
| Catálogo detallado | POST | `/api/packages` |
| Crear venta (idempotente por `sale_identifier`) | POST | `/api/sales` |
| Detalle de venta (eSIM, QR, SM-DP+) | GET | `/api/sales?sale_id=` |
| Buscar venta por referencia | GET | `/api/sales/history?sale_identifier=` |

El catálogo trae 6 paquetes de ejemplo (IDs `90001`–`90006`). Las ventas usan el mismo backend de persistencia que las SIM; `GET /api/mock/conecty/sales` las lista y `POST /api/mock/reset` las borra.
