declare const process: { env: Record<string, string | undefined> }
declare const Buffer: { from: (value: string, encoding: string) => { toString: (encoding: string) => string } }

const defaults = {
  consumerKey: 'local-crm',
  consumerSecret: 'local-secret-change-me',
  accessToken: 'local-altan-access-token'
}

export function localCredentials () {
  return {
    consumerKey: process.env.ALTAN_LOCAL_CONSUMER_KEY || defaults.consumerKey,
    consumerSecret: process.env.ALTAN_LOCAL_CONSUMER_SECRET || defaults.consumerSecret,
    accessToken: process.env.ALTAN_LOCAL_ACCESS_TOKEN || defaults.accessToken
  }
}

export function assertLocalBasicAuth (event: Parameters<typeof getHeader>[0]) {
  const authorization = getHeader(event, 'authorization')
  if (!authorization?.startsWith('Basic ')) throw createError({ statusCode: 401, data: { errorCode: 'LOCAL_401', message: 'Basic authorization is required.' } })
  const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8')
  const credentials = localCredentials()
  if (decoded !== `${credentials.consumerKey}:${credentials.consumerSecret}`) throw createError({ statusCode: 401, data: { errorCode: 'LOCAL_401', message: 'Invalid local consumer credentials.' } })
}

export function assertLocalBearer (event: Parameters<typeof getHeader>[0]) {
  const authorization = getHeader(event, 'authorization')
  if (authorization !== `Bearer ${localCredentials().accessToken}`) throw createError({ statusCode: 401, data: { errorCode: 'LOCAL_401', message: 'Missing or invalid local access token.' } })
}
