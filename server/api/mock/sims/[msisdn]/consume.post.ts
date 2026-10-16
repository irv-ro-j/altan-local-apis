import { consumeBenefits, updateSim } from '../../../../utils/mock'

export default defineEventHandler(async (event) => {
  const sim = await updateSim(getRouterParam(event, 'msisdn') || '', 'Active', (sim) => {
    if (!sim.benefits.length) throw createError({ statusCode: 409, data: { message: 'La SIM no tiene bolsas activas para consumir.' } })
    consumeBenefits(sim)
  })
  return { consumed: { data: 250, voice: 60, sms: 20 }, msisdn: sim.msisdn }
})
