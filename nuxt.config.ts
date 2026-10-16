// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    mockStorage: process.env.MOCK_STORAGE || 'memory',
    dynamodbTable: process.env.DYNAMODB_TABLE || '',
    dynamodbRegion: process.env.DYNAMODB_REGION || 'us-east-2',
    mockNamespace: process.env.MOCK_NAMESPACE || 'default'
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
