import { conectyError, conectyOk, ensureConectyToken, getSales, saleDetail } from '../../utils/conecty'

export default defineEventHandler((event) => {
  ensureConectyToken(event)
  const saleId = String(getQuery(event).sale_id || '')
  const sale = getSales().find(item => item.id === saleId)
  if (!sale) throw conectyError(404, `La venta ${saleId} no existe.`)
  return conectyOk(saleDetail(sale))
})