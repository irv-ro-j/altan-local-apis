import { operationResult, purchasePackage, updateSim } from '../../../../utils/mock'
import { ensureBearer, readPayload } from '../../../../utils/request'

export default defineEventHandler(async (event) => {
  ensureBearer(event)
  const body = await readPayload(event)
  const offers = body.offerings as unknown[] | undefined
  const offerId = String(offers?.[0] || '')
  if (!offerId) throw createError({ statusCode: 400, data: { message: 'offerings[0] is required' } })
  const sim = await updateSim(String(body.msisdn || ''), 'Active', (sim) => {
    if (sim.status !== 'Active') throw createError({ statusCode: 409, data: { message: 'Purchases require an Active SIM' } })
    purchasePackage(sim, offerId)
  })
  return operationResult('purchase', sim, offerId)
})
