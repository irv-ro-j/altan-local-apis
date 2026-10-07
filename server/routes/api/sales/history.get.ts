import { conectyOk, ensureConectyToken, getSales } from '../../../utils/conecty'

export default defineEventHandler((event) => {
  ensureConectyToken(event)
  const identifier = String(getQuery(event).sale_identifier || '')
  return conectyOk({ data: getSales().filter(sale => identifier && sale.identifier === identifier).map(sale => ({ sale_id: sale.id, sale_identifier: sale.identifier })) })
})