import { conectyError, conectyOk, createSale, ensureConectyToken, getSales } from '../../utils/conecty'

export default defineEventHandler(async (event) => {
  ensureConectyToken(event)
  const body = await readBody<{ products?: { id: number, quantity?: number }[], sale_identifier?: string }>(event)
  const product = body?.products?.[0]
  if (!product?.id) throw conectyError(400, 'products[0].id es requerido.')
  const identifier = body.sale_identifier || ''
  const existing = identifier ? getSales().find(sale => sale.identifier === identifier) : undefined
  return conectyOk({ id: (existing ?? createSale(Number(product.id), identifier)).id })
})