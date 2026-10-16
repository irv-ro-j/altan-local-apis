import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

const table = process.env.TEST_DYNAMODB_TABLE
if (!table) throw new Error('Set TEST_DYNAMODB_TABLE explicitly. This smoke test only writes to its own qa-smoke namespace.')
const region = process.env.DYNAMODB_REGION || 'us-east-2'
const namespace = `qa-smoke-${randomUUID()}`
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region, maxAttempts: 10 }))
const token = randomUUID()
let child

async function freePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

async function start() {
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  let logs = ''
  child = spawn(process.execPath, ['.output/server/index.mjs'], {
    windowsHide: true,
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1',
      NUXT_MOCK_STORAGE: 'dynamodb', NUXT_DYNAMODB_TABLE: table,
      NUXT_DYNAMODB_REGION: region, NUXT_MOCK_NAMESPACE: namespace,
      ALTAN_LOCAL_ACCESS_TOKEN: token, CONECTY_LOCAL_TOKEN: token
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (data) => {
    logs = (logs + data.toString()).slice(-16000)
  })
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`)
    try {
      const response = await fetch(`${base}/api/mock/health`, { signal: AbortSignal.timeout(2000) })
      if (response.ok) {
        assert.equal((await response.json()).storage, 'dynamodb')
        return base
      }
    } catch { /* Server or table initialization may still be starting. */ }
    await delay(250)
  }
  throw new Error(`Server did not become healthy: ${logs}`)
}

async function stop() {
  if (!child || child.exitCode !== null) return
  const current = child
  const exited = once(current, 'exit')
  current.kill()
  await exited
  child = undefined
}

async function request(base, path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000)
  })
  const data = await response.json()
  assert.equal(response.ok, true, JSON.stringify({ path, status: response.status, data }))
  return data
}

async function cleanup() {
  const Key = { pk: `${namespace}#meta`, sk: 'current' }
  const { Item } = await client.send(new GetCommand({ TableName: table, Key, ConsistentRead: true }))
  if (!Item) return
  for (const collection of ['sims', 'sales', 'saleIdentifiers']) {
    let cursor
    do {
      const result = await client.send(new QueryCommand({ TableName: table, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': `${namespace}#${Item.generation}#${collection}` }, ExclusiveStartKey: cursor, ConsistentRead: true }))
      for (let offset = 0; offset < (result.Items || []).length; offset += 25) {
        let writes = result.Items.slice(offset, offset + 25).map(({ pk, sk }) => ({ DeleteRequest: { Key: { pk, sk } } }))
        for (let attempt = 0; writes.length && attempt < 10; attempt++) {
          const deleted = await client.send(new BatchWriteCommand({ RequestItems: { [table]: writes } }))
          writes = deleted.UnprocessedItems?.[table] || []
          if (writes.length) await delay(200 * (attempt + 1))
        }
        assert.equal(writes.length, 0, 'QA records were not fully cleaned up')
      }
      cursor = result.LastEvaluatedKey
    } while (cursor)
  }
  await client.send(new DeleteCommand({ TableName: table, Key }))
}

try {
  const first = await start()
  assert.equal((await request(first, '/api/mock/sims')).length, 11)
  await request(first, '/cm/v1/subscribers/5550000001/activate', { offeringId: '1779900032' })
  await request(first, '/cm/v1/subscribers/5550000082/preregistered', { offeringId: '1779900032' })
  await request(first, '/cm/v1/subscribers/5550000082', { primaryOffering: { offeringId: '1779900033' } }, 'PATCH')
  const added = await request(first, '/api/mock/sims', { msisdns: '5550000080', status: 'Active' })
  assert.deepEqual(added.created, ['5550000080'])
  await request(first, '/api/mock/sims/5550000080/consume', {})
  await Promise.all([1, 2].map(() => request(first, '/cm/v1/products/purchase', { msisdn: '5550000080', offerings: ['1779900032'] })))
  const salePayload = { products: [{ id: 90001 }], sale_identifier: 'qa-persistent-sale' }
  const sales = await Promise.all([1, 2].map(() => request(first, '/api/sales', salePayload)))
  const saleId = sales[0].response.id
  assert.equal(sales[1].response.id, saleId, 'Concurrent retries must produce one sale')
  assert.equal((await request(first, '/api/mock/conecty/sales')).length, 1)
  await request(first, '/ac/v1/msisdns/port-in-c', { msisdnTransitory: '5550000002', msisdnPorted: '5550000081' })
  await stop()

  const second = await start()
  const sims = await request(second, '/api/mock/sims')
  assert.equal(sims.find(sim => sim.msisdn === '5550000001').status, 'Active')
  assert.equal(sims.find(sim => sim.msisdn === '5550000082').offerId, '1779900033')
  const saved = sims.find(sim => sim.msisdn === '5550000080')
  assert.equal(saved.benefitCount, 5)
  assert.equal(saved.balances.data, 5120 - 250 + 1024 * 2, 'Consumption and concurrent purchases must survive restart')
  assert.equal(sims.some(sim => sim.msisdn === '5550000002'), false, 'A ported fixture must not be recreated on cold start')
  assert.equal(sims.some(sim => sim.msisdn === '5550000081'), true)
  const profile = await request(second, '/cm/v1/subscribers/5550000080/profile')
  assert.equal(profile.responseSubscriber.freeUnits.length, 5)
  const detail = await request(second, `/api/sales?sale_id=${saleId}`)
  assert.equal(detail.response.data[0].iccid.length, 19)
  assert.equal((await request(second, '/api/sales', salePayload)).response.id, saleId)
  assert.equal((await request(second, '/api/sales/history?sale_identifier=qa-persistent-sale')).response.data.length, 1)
  assert.equal((await fetch(`${second}/cm/v1/subscribers/5550000088/profile`, { headers: { Authorization: `Bearer ${token}` } })).status, 404)
  assert.equal((await request(second, '/api/mock/sims')).length, sims.length, 'Profile reads must not provision missing SIMs')
  assert.equal((await fetch(`${second}/cm/v1/subscribers/5550000011/profile`, { headers: { Authorization: `Bearer ${token}` } })).status, 404)
  await request(second, '/api/mock/sims/5550000080/offer-type', { type: 'FFM' })
  const ffm = await request(second, '/cm/v1/subscribers/5550000080/profile')
  assert.equal(ffm.responseSubscriber.primaryOffering.offeringId, '1609903054')
  assert.equal(ffm.responseSubscriber.freeUnits[2].detailOfferings[0].offeringId, '1809906410')
  assert.equal((await request(second, '/api/mock/reset', {})).sims, 11)
  assert.equal((await request(second, '/api/mock/conecty/sales')).length, 0)
  assert.equal((await request(second, '/api/mock/sims')).some(sim => sim.msisdn === '5550000080'), false)
  assert.notEqual((await request(second, '/api/sales', salePayload)).response.id, saleId, 'Reset must clear the idempotency key too')
  console.log('PASS: real DynamoDB, process restart, activation, preregistration, plan changes, concurrent purchases, idempotent sales, port-in, profile reads and reset.')
} finally {
  await stop()
  await cleanup()
  client.destroy()
}
