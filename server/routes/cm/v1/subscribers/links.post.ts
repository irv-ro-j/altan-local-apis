import { crtLinkageFor, findSim, MSISDN_PATTERN } from '../../../../utils/mock'
import { ensureBearer, readPayload } from '../../../../utils/request'

export default defineEventHandler(async (event) => {
  ensureBearer(event)
  const body = await readPayload(event)
  const msisdn = String(body.msisdn || '')

  if (!MSISDN_PATTERN.test(msisdn)) {
    setResponseStatus(event, 400)
    return {
      errorCode: 'LOCAL_CRT_INVALID_MSISDN',
      detail: 'msisdn must have 10 digits.'
    }
  }

  const sim = await findSim(msisdn)
  if (!sim || sim.status === 'Deactive') {
    setResponseStatus(event, 400)
    return {
      errorCode: '400',
      detail: 'The subscriber does not exist'
    }
  }

  return crtLinkageFor(sim)
})
