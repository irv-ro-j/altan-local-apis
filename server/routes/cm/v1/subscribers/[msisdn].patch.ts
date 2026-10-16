import { changePlan, operationResult, updateSim } from '../../../../utils/mock'
import { ensureBearer, readPayload } from '../../../../utils/request'

export default defineEventHandler(async (event) => {
  ensureBearer(event)
  const body = await readPayload(event)
  const primary = body.primaryOffering as Record<string, unknown> | undefined
  const offerId = String(primary?.offeringId || '')
  if (!offerId) throw createError({ statusCode: 400, data: { message: 'primaryOffering.offeringId is required' } })
  const sim = await updateSim(getRouterParam(event, 'msisdn') || '', 'Active', (sim) => {
    if (sim.status !== 'Active') throw createError({ statusCode: 409, data: { message: 'Plan changes require an Active SIM' } })
    changePlan(sim, offerId)
  })
  return operationResult('change_offer', sim, offerId)
})
