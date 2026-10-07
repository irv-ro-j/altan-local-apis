declare const process: { env: Record<string, string | undefined> }

export type ConectyPackage = { intId: number, plan: string, price: number, specialPrice: number, currency: string, coverage_type: string, plan_type: string, coverage: string, coverage_codes: string, region: string, days: number, gb_capacity: string }
export type ConectySale = { id: string, identifier: string, packageId: number, createdAt: string }

const defaults = { document: 'local-document', apiKey: 'local-conecty-key', token: 'local-conecty-token' }

export function conectyCredentials () {
  return {
    document: process.env.CONECTY_LOCAL_DOCUMENT || defaults.document,
    apiKey: process.env.CONECTY_LOCAL_API_KEY || defaults.apiKey,
    token: process.env.CONECTY_LOCAL_TOKEN || defaults.token
  }
}

// Mismo formato de error que Conecty: { success: false, response: { message } }
export function conectyError (statusCode: number, message: string) {
  return createError({ statusCode, message, data: { success: false, response: { message } } })
}

export function ensureConectyToken (event: Parameters<typeof getHeader>[0]) {
  if (getHeader(event, 'authorization') !== `Bearer ${conectyCredentials().token}`) throw conectyError(401, 'Token inválido o expirado.')
}

export const conectyOk = (response: unknown) => ({ success: true, response })

const pkg = (intId: number, plan: string, price: number, region: string, coverage: string, codes: string, days: number, gb: string, coverageType = 'COUNTRY'): ConectyPackage => ({ intId, plan, price, specialPrice: Number((price * 0.8).toFixed(2)), currency: 'USD', coverage_type: coverageType, plan_type: 'DATA', coverage, coverage_codes: codes, region, days, gb_capacity: gb })
export const PACKAGES: ConectyPackage[] = [
  pkg(90001, 'Estados Unidos 1 GB 7 días', 6, 'América', 'Estados Unidos', 'US', 7, '1 GB'),
  pkg(90002, 'Estados Unidos 5 GB 30 días', 14, 'América', 'Estados Unidos', 'US', 30, '5 GB'),
  pkg(90003, 'Europa 3 GB 15 días', 12, 'Europa', 'Europa', 'ES,FR,DE,IT,PT', 15, '3 GB', 'REGION'),
  pkg(90004, 'Europa 10 GB 30 días', 28, 'Europa', 'Europa', 'ES,FR,DE,IT,PT', 30, '10 GB', 'REGION'),
  pkg(90005, 'República Dominicana 3 GB 15 días', 9, 'Caribe', 'República Dominicana', 'DO', 15, '3 GB'),
  pkg(90006, 'Global 5 GB 30 días', 35, 'Global', 'Global', 'WW', 30, '5 GB', 'GLOBAL')
]

declare global { var __conectyLocalSales: ConectySale[] | undefined }
export const getSales = () => globalThis.__conectyLocalSales ??= []
export const resetSales = () => { globalThis.__conectyLocalSales = []; return getSales() }

export function createSale (packageId: number, identifier: string): ConectySale {
  if (!Number.isInteger(packageId) || packageId <= 0) throw conectyError(404, `El paquete ${packageId} no existe.`)
  const sale = { id: String(700000 + getSales().length + 1), identifier, packageId, createdAt: new Date().toISOString() }
  getSales().push(sale)
  return sale
}

export function saleDetail (sale: ConectySale) {
  // IDs fuera del catálogo local (p. ej. importados del catálogo real) se simulan con un paquete genérico
  const item = PACKAGES.find(candidate => candidate.intId === sale.packageId) ?? { intId: sale.packageId, plan: `Paquete ${sale.packageId} (simulado)` }
  const iccid = `8957000000${sale.id.padStart(9, '0')}`
  return {
    data: [{ sale_id: sale.id, iccid, product_id: item.intId, productName: item.plan, qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(`LPA:1$sm-dp-plus.local$LOCAL-${sale.id}`)}`, manualActivation: { activationCode: `LOCAL-${sale.id}`, addressSmDp: 'sm-dp-plus.local' } }],
    install_instructions: 'Escanea el QR o ingresa manualmente la dirección SM-DP+ y el código de activación (simulador LOCAL).'
  }
}