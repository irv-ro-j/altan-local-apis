import { assertLocalBasicAuth, localCredentials } from '../../../utils/auth'
export default defineEventHandler((event) => { assertLocalBasicAuth(event); return { accessToken: localCredentials().accessToken, tokenType: 'Bearer', expiresIn: 3600, environment: 'LOCAL' } })
