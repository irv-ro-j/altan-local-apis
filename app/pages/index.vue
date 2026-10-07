<script setup lang="ts">
type MockSim = { msisdn: string, iccid: string, status: string, label: string, offerId: string, description: string, benefitCount: number, balances: { data: number, voice: number, sms: number } }
const { data: sims, refresh } = await useFetch<MockSim[]>('/api/mock/sims')
const { data: statuses } = await useFetch<{ status: string, label: string, description: string }[]>('/api/mock/statuses')
const newMsisdns = ref('')
const newStatus = ref('Idle')
const adding = ref(false)
const addResult = ref<{ created: string[], skipped: string[], invalid: string[] } | null>(null)
const addError = ref('')
async function addSims() {
  adding.value = true; addError.value = ''; addResult.value = null
  try {
    addResult.value = await $fetch('/api/mock/sims', { method: 'POST', body: { msisdns: newMsisdns.value, status: newStatus.value } })
    newMsisdns.value = [...addResult.value.skipped, ...addResult.value.invalid].join('\n')
    await refresh()
  } catch (error: any) {
    addError.value = error?.data?.data?.message || error?.data?.message || 'No se pudieron agregar las SIMs.'
  } finally { adding.value = false }
}
const { data: conectyPackages } = await useFetch<{ intId: number, plan: string, price: number, specialPrice: number, currency: string, region: string }[]>('/api/mock/conecty/packages')
const { data: conectySales, refresh: refreshConectySales } = await useFetch<{ id: string, identifier: string, packageId: number, createdAt: string }[]>('/api/mock/conecty/sales')
const copied = ref(false)
const consuming = ref<string | null>(null)
async function copyBaseUrl() { await navigator.clipboard.writeText('http://localhost:3000'); copied.value = true; setTimeout(() => { copied.value = false }, 1800) }
async function resetFixtures() { await $fetch('/api/mock/reset', { method: 'POST' }); await Promise.all([refresh(), refreshConectySales()]) }
async function consumeBalance(msisdn: string) { consuming.value = msisdn; try { await $fetch(`/api/mock/sims/${msisdn}/consume`, { method: 'POST' }); await refresh() } finally { consuming.value = null } }
useSeoMeta({ title: 'Altán local · API simulator', description: 'Simulador local de operaciones Altán para CRM.' })
</script>
<template>
  <section class="hero">
    <div class="eyebrow"><span class="pulse" /> Entorno de integración local</div>
    <h1>Prueba el flujo,<br><em>no la red.</em></h1>
    <p>Una réplica mínima de Altán para desarrollar activaciones, preactivaciones, compras, cambios de plan y consulta
      de perfil sin tocar una línea real.</p>
    <div class="connection-card"><span>URL base para configurar en CRM</span><code>http://localhost:3000</code><button
        type="button" @click="copyBaseUrl">{{ copied ? 'Copiada' : 'Copiar URL' }}</button></div>
    <div class="hero-notes"><span>6 endpoints disponibles</span><span>Estado en memoria</span><span>Fixtures
        reiniciables</span></div>
  </section>
  <section id="alta" class="content-section add-sims">
    <p class="eyebrow">Alta de SIMs</p>
    <h2>Agrega SIMs con el estado que necesites</h2>
    <p class="section-intro">Un MSISDN de 10 dígitos por línea (también se aceptan comas o espacios). Los números que ya
      existen se omiten.</p>
    <form class="add-form" @submit.prevent="addSims">
      <textarea v-model="newMsisdns" rows="6" placeholder="5551230001&#10;5551230002&#10;5551230003" required />
      <div class="add-controls">
        <label>Estado inicial
          <select v-model="newStatus">
            <option v-for="item in statuses" :key="item.status" :value="item.status">{{ item.label }}
              ({{ item.status }})</option>
          </select>
        </label>
        <button class="quiet-button" type="submit"
          :disabled="adding || !newMsisdns.trim()">{{ adding ? 'Agregando…' : 'Agregar SIMs' }}</button>
      </div>
      <p v-if="addError" class="add-feedback error">{{ addError }}</p>
      <p v-if="addResult" class="add-feedback">
        <b>{{ addResult.created.length }}</b> agregadas<template v-if="addResult.skipped.length"> ·
          {{ addResult.skipped.length }} ya existían</template><template v-if="addResult.invalid.length"> ·
          {{ addResult.invalid.length }} inválidas (se dejaron en el cuadro)</template>
      </p>
    </form>
  </section>
  <section id="sims" class="content-section">
    <div class="section-heading">
      <div>
        <p class="eyebrow">SIMs de laboratorio</p>
        <h2>Un número por escenario</h2>
      </div><button class="quiet-button" type="button" @click="resetFixtures">Restaurar escenarios</button>
    </div>
    <p class="section-intro">El botón consume 250 MB, 60 minutos y 20 SMS. Refresca el perfil del CRM para observar las
      bolsas reducidas.</p>
    <div class="sim-grid">
      <article v-for="sim in sims" :key="sim.msisdn" class="sim-card">
        <div class="sim-card-top"><span
            :class="['status-dot', sim.status === 'Active' ? 'active' : '']" />{{ sim.label }}
        </div><code>{{ sim.msisdn }}</code>
        <p>{{ sim.description }}</p>
        <div v-if="sim.benefitCount" class="balances"><span><b>{{ sim.balances.data }}</b>
            MB</span><span><b>{{ sim.balances.voice }}</b> min</span><span><b>{{ sim.balances.sms }}</b> SMS</span>
        </div>
        <button v-if="sim.benefitCount" class="consume-button" type="button" :disabled="consuming === sim.msisdn"
          @click="consumeBalance(sim.msisdn)">{{ consuming === sim.msisdn ? 'Consumiendo…' : 'Consumir saldo' }}</button>
        <footer><span>Oferta {{ sim.offerId }}</span><span>{{ sim.iccid }}</span></footer>
      </article>
    </div>
  </section>
  <section id="endpoints" class="content-section endpoints">
    <p class="eyebrow">Contrato compatible</p>
    <h2>Endpoints expuestos</h2>
    <div class="endpoint-list">
      <div><b class="post">POST</b><code>/v1/oauth/accesstoken</code><span>Token local</span></div>
      <div><b class="get">GET</b><code>/cm/v1/subscribers/{msisdn}/profile</code><span>Perfil y estado</span></div>
      <div><b class="post">POST</b><code>/cm/v1/subscribers/{msisdn}/activate</code><span>Activa una SIM Idle</span>
      </div>
      <div><b class="post">POST</b><code>/cm/v1/subscribers/{msisdn}/preregistered</code><span>Preactivación</span>
      </div>
      <div><b class="post">POST</b><code>/cm/v1/products/purchase</code><span>Compra / recarga</span></div>
      <div><b class="patch">PATCH</b><code>/cm/v1/subscribers/{msisdn}</code><span>Cambio de plan</span></div>
    </div>
  </section>
  <section id="conecty" class="content-section endpoints">
    <p class="eyebrow">Conecty · eSIMs de viaje</p>
    <h2>API de Conecty simulada</h2>
    <p class="section-intro">En el CRM, Integradores &gt; Conecty, elige el ambiente <code>LOCAL</code> y usa las credenciales
      de <code>.env</code> (por defecto <code>local-document</code> / <code>local-conecty-key</code>).</p>
    <div class="endpoint-list">
      <div><b class="get">GET</b><code>/users/login?document=</code><span>Token (header x-api-key)</span></div>
      <div><b class="get">GET</b><code>/api/packages</code><span>Catálogo básico</span></div>
      <div><b class="post">POST</b><code>/api/packages</code><span>Catálogo detallado</span></div>
      <div><b class="post">POST</b><code>/api/sales</code><span>Crear venta (idempotente)</span></div>
      <div><b class="get">GET</b><code>/api/sales?sale_id=</code><span>Detalle de eSIM</span></div>
      <div><b class="get">GET</b><code>/api/sales/history?sale_identifier=</code><span>Buscar por referencia</span></div>
    </div>
    <div class="section-heading">
      <h2>Paquetes ({{ conectyPackages?.length || 0 }})</h2>
    </div>
    <div class="sim-grid">
      <article v-for="item in conectyPackages" :key="item.intId" class="sim-card">
        <div class="sim-card-top">{{ item.plan }}</div><code>{{ item.intId }}</code>
        <p>{{ item.region }} · {{ item.currency }} {{ item.price }} (distribuidor {{ item.specialPrice }})</p>
      </article>
    </div>
    <div class="section-heading">
      <h2>Ventas simuladas ({{ conectySales?.length || 0 }})</h2>
      <button class="quiet-button" type="button" @click="refreshConectySales()">Actualizar</button>
    </div>
    <p v-if="!conectySales?.length" class="section-intro">Aún no hay ventas. Se crean cuando el CRM despacha una orden con producto Conecty.</p>
    <div v-else class="endpoint-list">
      <div v-for="sale in conectySales" :key="sale.id"><code>{{ sale.id }}</code><code>{{ sale.identifier || 'sin referencia' }}</code><span>Paquete {{ sale.packageId }}</span></div>
    </div>
  </section>
  <section id="uso" class="content-section setup">
    <p class="eyebrow">Configuración CRM</p>
    <h2>Selecciona <code>LOCAL</code> y pega las rutas.</h2>
    <ol>
      <li>Inicia este proyecto con <code>pnpm dev</code>.</li>
      <li>En el CRM, selecciona el ambiente <code>LOCAL</code>.</li>
      <li>Configura la URL base y habilita transacciones para ejecutar llamadas simuladas.</li>
    </ol>
    <p class="caution">El proceso no almacena información: una recarga, cambio de oferta o activación se descarta al
      reiniciar.</p>
  </section>
</template>
<style scoped>
.add-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 560px;
  margin-top: 16px
}

.add-form textarea,
.add-form select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  background: #fff;
  color: var(--ink)
}

.add-form textarea {
  font-family: ui-monospace, Consolas, monospace;
  resize: vertical
}

.add-controls {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap
}

.add-controls label {
  flex: 1;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted)
}

.add-controls button:disabled {
  opacity: .55;
  cursor: not-allowed
}

.add-feedback {
  font-size: 13px;
  color: var(--navy);
  margin: 0
}

.add-feedback.error {
  color: #b42318
}
</style>
