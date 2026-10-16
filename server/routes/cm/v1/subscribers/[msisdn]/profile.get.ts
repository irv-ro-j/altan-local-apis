import { findSim, profileFor } from '../../../../../utils/mock'
import { ensureBearer } from '../../../../../utils/request'

export default defineEventHandler(async (event) => {
  ensureBearer(event)
  const sim = await findSim(getRouterParam(event, 'msisdn') || '')
  if (!sim || sim.status === 'Deactive') {
    setResponseStatus(event, 404)
    return { errorCode: '1211000305', message: 'Subscriber not found' }
  }
  return profileFor(sim)
})
