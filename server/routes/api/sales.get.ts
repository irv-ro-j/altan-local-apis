import { conectyError, conectyOk, ensureConectyToken, findSale, saleDetail } from '../../utils/conecty'

export default defineEventHandler(async (event) => {
  ensureConectyToken(event)
  const saleId = String(getQuery(event).sale_id || '')
  const sale = await findSale(saleId)
  if (!sale) throw conectyError(404, `La venta ${saleId} no existe.`)
  return conectyOk(saleDetail(sale))
})
