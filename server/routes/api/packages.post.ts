import { conectyOk, ensureConectyToken, PACKAGES } from '../../utils/conecty'

export default defineEventHandler((event) => {
  ensureConectyToken(event)
  return conectyOk({ data: PACKAGES.map(({ intId, ...rest }) => ({ int_id: intId, ...rest })) })
})