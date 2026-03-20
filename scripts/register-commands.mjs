const baseUrl = (process.env.COMMANDS_REGISTER_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')

if (!baseUrl) {
  console.error('Missing COMMANDS_REGISTER_URL or PUBLIC_APP_URL. Slash commands were not re-registered.')
  process.exit(1)
}

const endpoint = `${baseUrl}/commands/register`
const registerSecret = process.env.COMMANDS_REGISTER_SECRET?.trim()

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(registerSecret ? { 'x-register-secret': registerSecret } : {})
  }
})

if (!response.ok) {
  const body = await response.text()
  console.error(`Command registration failed (${response.status}) at ${endpoint}`)
  if (body) {
    console.error(body)
  }
  process.exit(1)
}

const payload = await response.json().catch(() => null)
if (!payload?.ok) {
  console.error(`Command registration did not return success at ${endpoint}`)
  process.exit(1)
}

console.log(`Slash commands re-registered via ${endpoint}`)
