export async function readPayload (event: Parameters<typeof readBody>[0]) { return (await readBody<Record<string, unknown>>(event)) || {} }
export { assertLocalBearer as ensureBearer } from './auth'
