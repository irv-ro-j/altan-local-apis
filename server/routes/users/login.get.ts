import { conectyCredentials, conectyError, conectyOk } from '../../utils/conecty'

export default defineEventHandler((event) => {
  const credentials = conectyCredentials()
  const { document } = getQuery(event)
  if (getHeader(event, 'x-api-key') !== credentials.apiKey || String(document || '') !== credentials.document) throw conectyError(401, 'Credenciales inválidas del simulador LOCAL.')
  return conectyOk({ token: credentials.token })
})