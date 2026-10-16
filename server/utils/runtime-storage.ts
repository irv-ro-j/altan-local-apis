import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { createInitialSims } from '../lib/sim-data'
import { DynamoBackend, MemoryBackend, MockStore } from '../lib/storage'

let store: MockStore | undefined
export function getStore() {
  if (store) return store
  const config = useRuntimeConfig()
  const seeds = createInitialSims().map(value => ({ collection: 'sims' as const, key: value.msisdn, value }))
  if (config.mockStorage === 'memory') store = new MockStore(new MemoryBackend(seeds))
  else if (config.mockStorage === 'dynamodb') {
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.dynamodbRegion, maxAttempts: 8 }), { marshallOptions: { removeUndefinedValues: true } })
    store = new MockStore(new DynamoBackend({ client, table: config.dynamodbTable, namespace: config.mockNamespace, seeds }))
  } else throw new Error('MOCK_STORAGE debe ser memory o dynamodb.')
  return store
}
