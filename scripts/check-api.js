// Verify the Meta Model API setup before a demo:  npm run check:api
// Lists the models your key can use and runs one tiny Muse Spark JSON call.
// Never prints the key.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { readConfig } from '../server/server.js'
import { createMetaClient } from '../server/meta.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env') })
const config = readConfig()

if (!config.apiKey) {
  console.log('✗ META_API_KEY is empty — copy .env.example to .env and paste your key from https://dev.meta.ai')
  process.exit(1)
}
console.log(`Base URL: ${config.baseUrl}`)
const meta = createMetaClient(config)

try {
  const ids = await meta.listModels()
  console.log(`✓ Key accepted — ${ids.length} models available`)
  for (const [role, id] of Object.entries(config.models)) {
    console.log(`  ${ids.includes(id) ? '✓' : '✗'} ${role.padEnd(8)} ${id}${ids.includes(id) ? '' : '  (not in /models list)'}`)
  }
} catch (e) {
  console.log(`✗ /models failed: ${e.message}`)
}

try {
  const t0 = Date.now()
  const { json, usage } = await meta.chatJSON({
    messages: [{ role: 'user', content: 'Reply with {"ok": true, "greeting": "<one word hello in Indonesian>"}' }],
    schema: { name: 'ping', schema: { type: 'object', properties: { ok: { type: 'boolean' }, greeting: { type: 'string' } }, required: ['ok'] } },
    maxTokens: 2000,
  })
  console.log(`✓ ${config.models.text} JSON call in ${((Date.now() - t0) / 1000).toFixed(1)}s →`, JSON.stringify(json), usage ? `(tokens: ${usage.total_tokens ?? '?'})` : '')
} catch (e) {
  console.log(`✗ ${config.models.text} call failed: ${e.message}`)
  process.exitCode = 1
}
