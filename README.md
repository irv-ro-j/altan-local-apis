# Altán Local APIs

Simulador local, sin persistencia, para integrar el CRM con las operaciones principales de Altán sin realizar transacciones reales.

## Arranque

```bash
pnpm dev
```

El portal y la API quedan disponibles en `http://localhost:3000`.

## Endpoints compatibles

| Operación | Método | Ruta |
| --- | --- | --- |
| Token | POST | `/v1/oauth/accesstoken` |
| Perfil | GET | `/cm/v1/subscribers/{msisdn}/profile` |
| Activación | POST | `/cm/v1/subscribers/{msisdn}/activate` |
| Preactivación | POST | `/cm/v1/subscribers/{msisdn}/preregistered` |
| Compra/recarga | POST | `/cm/v1/products/purchase` |
| Cambio de plan | PATCH | `/cm/v1/subscribers/{msisdn}` |
| Portabilidad entrante | POST | `/ac/v1/msisdns/port-in-c` |

El endpoint de token exige Basic Auth correcto. Las rutas operativas exigen el Bearer emitido. Copia `.env.example` a `.env` para cambiar los valores; si no existe `.env`, los valores predeterminados son `local-crm`, `local-secret-change-me` y `local-altan-access-token`.

## Escenarios de SIM

| MSISDN | Estado inicial |
| --- | --- |
| `5550000001` | Idle |
| `5550000002` | Active |
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

Los cambios se mantienen únicamente en memoria. Activación y preactivación cambian una SIM `Idle` a `Active`, asignan el plan principal y crean bolsas de 5,120 MB, 1,500 minutos y 500 SMS con vigencia de 30 días. Una compra agrega una bolsa de 1,024 MB con vigencia de 30 días. El cambio de plan reemplaza las bolsas del plan principal. Reinicia el proceso o llama a `POST /api/mock/reset` para volver al estado inicial.

## Utilidades propias del mock

- `GET /api/mock/health`
- `GET /api/mock/sims`
- `POST /api/mock/sims/{msisdn}/consume` — consume 250 MB, 60 minutos y 20 SMS.
- `POST /api/mock/reset`

## Uso desde CRM

El CRM usa actualmente el mock remoto de Amplify para todas las operaciones
del ambiente `LOCAL`, incluida la portabilidad. Este simulador se conserva para
pruebas locales directas y para una futura migración integral; no requiere
configuración adicional en el CRM mientras se mantenga esa estrategia.
