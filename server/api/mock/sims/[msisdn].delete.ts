import { MSISDN_PATTERN, removeSim } from '../../../utils/mock'

export default defineEventHandler(async (event) => {
  const msisdn = getRouterParam(event, 'msisdn') || ''
  if (!MSISDN_PATTERN.test(msisdn)) {
    throw createError({ statusCode: 400, data: { message: 'El MSISDN debe tener 10 dÃ­gitos.' } })
  }

  if (!await removeSim(msisdn)) {
    throw createError({ statusCode: 404, data: { message: `No se encontrÃ³ la SIM ${msisdn}.` } })
  }

  return { deleted: msisdn }
})
