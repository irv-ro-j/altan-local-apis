import { changeNir, changePlan, operationResult, updateSim } from '../../../../utils/mock'
import { ensureBearer, readPayload } from '../../../../utils/request'

export default defineEventHandler(async (event) => {
  ensureBearer(event)
  const body = await readPayload(event)
  if ('changeSubscriberMSISDN' in body) {
    const change = body.changeSubscriberMSISDN
    if ('primaryOffering' in body || !change || typeof change !== 'object' || Array.isArray(change)) {
      throw createError({ statusCode: 400, data: { message: 'Provide only changeSubscriberMSISDN or primaryOffering.' } })
    }
    const { zone, msisdnType } = change as Record<string, unknown>
    if (typeof zone !== 'string' || !/^[2-9]$/.test(zone)
      || typeof msisdnType !== 'string' || !/^\d{1,2}$/.test(msisdnType)) {
      throw createError({ statusCode: 400, data: { message: 'changeSubscriberMSISDN requires zone (2-9) and msisdnType (1-2 digits) as strings.' } })
    }
    return await changeNir(getRouterParam(event, 'msisdn') || '', zone, msisdnType)
  }
  const primary = body.primaryOffering as Record<string, unknown> | undefined
  const offerId = String(primary?.offeringId || '')
  if (!offerId) throw createError({ statusCode: 400, data: { message: 'primaryOffering.offeringId is required' } })
  const sim = await updateSim(getRouterParam(event, 'msisdn') || '', 'Active', (sim) => {
    if (sim.status !== 'Active') throw createError({ statusCode: 409, data: { message: 'Plan changes require an Active SIM' } })
    changePlan(sim, offerId)
  })
  return operationResult('change_offer', sim, offerId)
})
