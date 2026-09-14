import { requireSim, setOfferLifecycleType, type OfferLifecycleType } from '../../../../utils/mock'

export default defineEventHandler(async (event) => {
  const sim = requireSim(getRouterParam(event, 'msisdn') || '')
  const body = await readBody<{ type?: string }>(event)
  const type = body?.type as OfferLifecycleType
  if (type !== 'MULTI' && type !== 'FFM') throw createError({ statusCode: 400, data: { message: 'type debe ser "MULTI" o "FFM"' } })
  if (sim.status !== 'Active') throw createError({ statusCode: 409, data: { message: 'La SIM debe estar Active para asignarle una oferta primaria/suplementaria.' } })
  setOfferLifecycleType(sim, type)
  return { msisdn: sim.msisdn, offerId: sim.offerId, type, benefits: sim.benefits }
})
