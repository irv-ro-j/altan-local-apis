import { MSISDN_PATTERN, type MockSim } from '../../../../utils/mock'
import { getStore } from '../../../../utils/runtime-storage'
import { StorageConflictError } from '../../../../lib/storage'

export default defineEventHandler(async (event) => {
  const msisdn = getRouterParam(event, 'msisdn') || ''
  if (!MSISDN_PATTERN.test(msisdn)) {
    throw createError({ statusCode: 400, data: { message: 'El MSISDN debe tener 10 dígitos.' } })
  }
  const body = await readBody<{ isCrtLinked?: unknown } | null>(event)
  const isCrtLinked = body?.isCrtLinked
  if (typeof isCrtLinked !== 'boolean') {
    throw createError({ statusCode: 400, data: { message: 'isCrtLinked debe ser un booleano.' } })
  }
  try {
    const sim = await getStore().update<MockSim>('sims', msisdn, () => {
      throw createError({ statusCode: 404, data: { message: `No se encontró la SIM ${msisdn}.` } })
    }, (sim) => {
      sim.isCrtLinked = isCrtLinked
    })
    return { msisdn: sim.msisdn, isCrtLinked: sim.isCrtLinked }
  } catch (error) {
    if (error instanceof StorageConflictError) {
      throw createError({ statusCode: 409, data: { message: error.message } })
    }
    throw error
  }
})
