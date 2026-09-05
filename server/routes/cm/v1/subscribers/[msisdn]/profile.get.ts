import { profileFor, requireSim } from '../../../../../utils/mock'
import { ensureBearer } from '../../../../../utils/request'
export default defineEventHandler((event) => { ensureBearer(event); return profileFor(requireSim(getRouterParam(event, 'msisdn') || '')) })
