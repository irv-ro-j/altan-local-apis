import { getStore } from '../../utils/runtime-storage'

export default defineEventHandler(async () => {
  await getStore().ready()
  return { status: 'ok', environment: 'LOCAL', storage: useRuntimeConfig().mockStorage }
})
