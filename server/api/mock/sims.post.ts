import { addSim, MSISDN_PATTERN } from '../../utils/mock'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ msisdns?: string | string[], status?: string, isCrtLinked?: boolean }>(event)
  const raw = Array.isArray(body?.msisdns) ? body.msisdns.join('\n') : String(body?.msisdns || '')
  const msisdns = [...new Set(raw.split(/[\s,;]+/).filter(Boolean))]
  if (!msisdns.length) throw createError({ statusCode: 400, data: { message: 'Indica al menos un MSISDN.' } })
  if (!body?.status) throw createError({ statusCode: 400, data: { message: 'Indica el estado inicial.' } })
  if (body.isCrtLinked !== undefined && typeof body.isCrtLinked !== 'boolean') {
    throw createError({ statusCode: 400, data: { message: 'isCrtLinked debe ser booleano.' } })
  }

  const created: string[] = []
  const skipped: string[] = []
  const invalid: string[] = []
  for (const msisdn of msisdns) {
    if (!MSISDN_PATTERN.test(msisdn)) invalid.push(msisdn)
    else if (await addSim(msisdn, body.status, body.isCrtLinked ?? false)) created.push(msisdn)
    else skipped.push(msisdn)
  }
  return { status: body.status, created, skipped, invalid }
})
