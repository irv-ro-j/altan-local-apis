import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { BatchWriteCommand, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient, QueryCommandOutput } from '@aws-sdk/lib-dynamodb'

export type Collection = 'sims' | 'sales' | 'saleIdentifiers'
export type Entry = { collection: Collection, key: string, value: unknown }
type Document = { value: unknown, revision: number }
type Write = { collection: Collection, key: string, value?: unknown, revision: number | null }
interface Backend {
  scope(): Promise<string>
  read(scope: string, collection: Collection, key: string): Promise<Document | undefined>
  list(scope: string, collection: Collection): Promise<unknown[]>
  commit(scope: string, writes: Write[]): Promise<boolean>
  reset(): Promise<void>
}

export class DuplicateKeyError extends Error {}
export class StorageConflictError extends Error {}

// A mutation retries against the latest record rather than overwriting another
// instance's changes. Reads never expose references to the in-memory backend.
export class MockStore {
  constructor(private backend: Backend) {}

  async list<T>(collection: Collection): Promise<T[]> {
    return await this.backend.list(await this.backend.scope(), collection) as T[]
  }

  async get<T>(collection: Collection, key: string): Promise<T | undefined> {
    return (await this.backend.read(await this.backend.scope(), collection, key))?.value as T | undefined
  }

  async create(entries: Entry[]): Promise<boolean> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const scope = await this.backend.scope()
      if (await this.backend.commit(scope, entries.map(entry => ({ ...entry, revision: null })))) return true
      if (await this.backend.scope() === scope) {
        const existing = await Promise.all(entries.map(entry => this.backend.read(scope, entry.collection, entry.key)))
        if (existing.some(Boolean)) return false
      }
      await delay(10 + Math.random() * 40 * (attempt + 1))
    }
    throw new StorageConflictError('El simulador cambió durante la operación. Intenta nuevamente.')
  }

  async update<T>(collection: Collection, key: string, factory: () => T, change: (value: T) => void, keyFor: (value: T) => string = () => key): Promise<T> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const scope = await this.backend.scope()
      const current = await this.backend.read(scope, collection, key)
      const value = structuredClone(current ? current.value : factory()) as T
      change(value)
      const destination = keyFor(value)
      const writes: Write[] = [{ collection, key, value, revision: current?.revision ?? null }]
      if (destination !== key) {
        if (await this.backend.read(scope, collection, destination)) throw new DuplicateKeyError(destination)
        writes[0] = { collection, key, revision: current?.revision ?? null }
        writes.push({ collection, key: destination, value, revision: null })
      }
      if (await this.backend.commit(scope, writes)) return value
      await delay(10 + Math.random() * 40 * (attempt + 1))
    }
    throw new StorageConflictError('El registro cambió durante la operación. Intenta nuevamente.')
  }

  async delete(collection: Collection, key: string): Promise<boolean> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const scope = await this.backend.scope()
      const current = await this.backend.read(scope, collection, key)
      if (!current) return false
      if (await this.backend.commit(scope, [{ collection, key, revision: current.revision }])) return true
      await delay(10 + Math.random() * 40 * (attempt + 1))
    }
    throw new StorageConflictError('El registro cambiÃ³ durante la operaciÃ³n. Intenta nuevamente.')
  }

  async reset() { await this.backend.reset() }
  async ready() { await this.backend.scope() }
}

export class MemoryBackend implements Backend {
  private generation = ''
  private documents = new Map<string, Document>()
  constructor(private seeds: Entry[]) { this.seed() }
  private id(scope: string, collection: Collection, key: string) { return JSON.stringify([scope, collection, key]) }
  private seed() {
    this.generation = randomUUID()
    this.documents.clear()
    for (const seed of this.seeds) this.documents.set(this.id(this.generation, seed.collection, seed.key), { value: structuredClone(seed.value), revision: 1 })
  }

  async scope() { return this.generation }
  async read(scope: string, collection: Collection, key: string) { return structuredClone(this.documents.get(this.id(scope, collection, key))) }
  async list(scope: string, collection: Collection) {
    return [...this.documents.entries()].filter(([id]) => {
      const [generation, name] = JSON.parse(id)
      return generation === scope && name === collection
    }).map(([, doc]) => structuredClone(doc.value))
  }

  async commit(scope: string, writes: Write[]) {
    if (scope !== this.generation) return false
    if (writes.some(write => (this.documents.get(this.id(scope, write.collection, write.key))?.revision ?? null) !== write.revision)) return false
    for (const write of writes) {
      const id = this.id(scope, write.collection, write.key)
      if (write.value === undefined) this.documents.delete(id)
      else this.documents.set(id, { value: structuredClone(write.value), revision: (write.revision ?? 0) + 1 })
    }
    return true
  }

  async reset() { this.seed() }
}

function isConflict(error: unknown) {
  const failure = error as { name?: string, CancellationReasons?: { Code?: string }[] }
  return failure.name === 'ConditionalCheckFailedException' || failure.name === 'TransactionConflictException'
    || (failure.name === 'TransactionCanceledException' && failure.CancellationReasons?.some(reason => ['ConditionalCheckFailed', 'TransactionConflict'].includes(reason.Code || '')))
}

export class DynamoBackend implements Backend {
  constructor(private options: { client: DynamoDBDocumentClient, table: string, namespace: string, seeds: Entry[] }) {
    if (!options.table || !options.namespace) throw new Error('DynamoDB requiere una tabla y un namespace.')
  }

  private metaKey() { return { pk: `${this.options.namespace}#meta`, sk: 'current' } }
  private key(scope: string, collection: Collection, key: string) { return { pk: `${this.options.namespace}#${scope}#${collection}`, sk: key } }
  private async current() {
    const result = await this.options.client.send(new GetCommand({ TableName: this.options.table, Key: this.metaKey(), ConsistentRead: true }))
    return result.Item?.generation as string | undefined
  }

  private async seed(previous?: string) {
    const generation = randomUUID()
    try {
      await this.options.client.send(new TransactWriteCommand({ TransactItems: [
        { Put: { TableName: this.options.table, Item: { ...this.metaKey(), generation }, ConditionExpression: previous ? 'generation = :previous' : 'attribute_not_exists(pk)', ...(previous ? { ExpressionAttributeValues: { ':previous': previous } } : {}) } },
        ...this.options.seeds.map(seed => ({ Put: { TableName: this.options.table, Item: { ...this.key(generation, seed.collection, seed.key), value: seed.value, revision: 1 } } }))
      ] }))
      return generation
    } catch (error) {
      if (isConflict(error)) return undefined
      throw error
    }
  }

  async scope(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const generation = await this.current() || await this.seed()
      if (generation) return generation
    }
    throw new StorageConflictError('No se pudo inicializar el almacenamiento del simulador.')
  }

  async read(scope: string, collection: Collection, key: string): Promise<Document | undefined> {
    const result = await this.options.client.send(new GetCommand({ TableName: this.options.table, Key: this.key(scope, collection, key), ConsistentRead: true }))
    return result.Item ? { value: result.Item.value, revision: result.Item.revision } : undefined
  }

  private async items(scope: string, collection: Collection) {
    const items: Record<string, unknown>[] = []
    let cursor
    do {
      const result: QueryCommandOutput = await this.options.client.send(new QueryCommand({ TableName: this.options.table, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': this.key(scope, collection, '').pk }, ConsistentRead: true, ExclusiveStartKey: cursor }))
      items.push(...(result.Items || []))
      cursor = result.LastEvaluatedKey
    } while (cursor)
    return items
  }

  async list(scope: string, collection: Collection) { return (await this.items(scope, collection)).map(item => item.value) }

  async commit(scope: string, writes: Write[]) {
    try {
      await this.options.client.send(new TransactWriteCommand({ TransactItems: [
        { ConditionCheck: { TableName: this.options.table, Key: this.metaKey(), ConditionExpression: 'generation = :generation', ExpressionAttributeValues: { ':generation': scope } } },
        ...writes.map((write) => {
          const condition = {
            TableName: this.options.table,
            ConditionExpression: write.revision === null ? 'attribute_not_exists(pk)' : 'revision = :revision',
            ...(write.revision === null ? {} : { ExpressionAttributeValues: { ':revision': write.revision } })
          }
          return write.value === undefined
            ? { Delete: { ...condition, Key: this.key(scope, write.collection, write.key) } }
            : { Put: { ...condition, Item: { ...this.key(scope, write.collection, write.key), value: write.value, revision: (write.revision ?? 0) + 1 } } }
        })
      ] }))
      return true
    } catch (error) {
      if (isConflict(error)) return false
      throw error
    }
  }

  private async clean(scope: string) {
    for (const collection of ['sims', 'sales', 'saleIdentifiers'] as const) {
      const items = await this.items(scope, collection)
      for (let offset = 0; offset < items.length; offset += 25) {
        let requests = items.slice(offset, offset + 25).map(item => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } }))
        for (let attempt = 0; requests.length && attempt < 10; attempt++) {
          const result = await this.options.client.send(new BatchWriteCommand({ RequestItems: { [this.options.table]: requests } }))
          requests = result.UnprocessedItems?.[this.options.table] as typeof requests || []
          if (requests.length) await delay(100 * (attempt + 1))
        }
        if (requests.length) throw new Error('Quedaron registros de una generación anterior por limpiar.')
      }
    }
  }

  async reset() {
    for (let attempt = 0; attempt < 10; attempt++) {
      const previous = await this.scope()
      if (await this.seed(previous)) {
        // The generation switch and fixtures are atomic. All subsequent writes
        // check that pointer, so no operation can recreate an old generation.
        try {
          await this.clean(previous)
        } catch (error) {
          console.warn('No se pudo limpiar la generación anterior del simulador.', error instanceof Error ? error.name : 'StorageError')
        }
        return
      }
    }
    throw new StorageConflictError('No se pudo reiniciar el simulador. Intenta nuevamente.')
  }
}
