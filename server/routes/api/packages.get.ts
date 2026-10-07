import { conectyOk, ensureConectyToken, PACKAGES } from '../../utils/conecty'

export default defineEventHandler((event) => {
  ensureConectyToken(event)
  return conectyOk({ data: PACKAGES.map(({ intId, plan, price, specialPrice, currency }) => ({ intId, plan, price, specialPrice, currency })) })
})