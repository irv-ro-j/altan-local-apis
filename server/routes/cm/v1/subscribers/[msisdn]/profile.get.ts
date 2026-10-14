import { profileFor, requireSim } from '../../../../../utils/mock'
import { ensureBearer } from '../../../../../utils/request'

export default defineEventHandler((event) => {
  ensureBearer(event)
  const sim = requireSim(getRouterParam(event, 'msisdn') || '')
  if (sim.status === 'Deactive') {
    setResponseStatus(event, 404)
    return { errorCode: '1211000305', message: 'Subscriber not found' }
  }
  return profileFor(sim)
})
