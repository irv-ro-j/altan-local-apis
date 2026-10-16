import { conectyOk, ensureConectyToken, saleForIdentifier } from '../../../utils/conecty'

export default defineEventHandler(async (event) => {
  ensureConectyToken(event)
  const identifier = String(getQuery(event).sale_identifier || '')
  const sale = await saleForIdentifier(identifier)
  return conectyOk({ data: sale ? [{ sale_id: sale.id, sale_identifier: sale.identifier }] : [] })
})
