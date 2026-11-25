import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const serviceName = 'sungbok-web'
const npmCli = process.env.npm_execpath
const npxCli = npmCli ? path.join(path.dirname(npmCli), 'npx-cli.js') : null
const cliArgs = ['--yes', '@insforge/cli@0.2.8']
const flyConfig = path.resolve('fly.toml')
const runtimeFile = '.insforge/compute-runtime.env'
const toolsDirectory = path.resolve('.insforge/tools/flyctl-0.5.17')
const deployEnv = { ...process.env }

if (fs.existsSync(toolsDirectory)) {
  deployEnv.PATH = `${toolsDirectory}${path.delimiter}${process.env.PATH ?? ''}`
}

function queryCli(args) {
  return JSON.parse(execFileSync(process.execPath, [npxCli, ...cliArgs, ...args, '--json'], {
    encoding: 'utf8', env: deployEnv, stdio: ['ignore', 'pipe', 'inherit'],
  }))
}

try {
  if (!npmCli) throw new Error('Run this script with npm run deploy:compute.')
  if (fs.existsSync(flyConfig)) throw new Error('fly.toml already exists. Move it aside before running this deployment.')

  const project = JSON.parse(fs.readFileSync('.insforge/project.json', 'utf8'))
  const services = queryCli(['compute', 'list'])
  if (!services.some(service => service.name === serviceName) && !fs.existsSync(runtimeFile)) {
    throw new Error('Initial Compute deployment requires .insforge/compute-runtime.env with the application runtime variables.')
  }

  const anonymousKey = queryCli(['secrets', 'get', 'ANON_KEY']).value
  if (!project.oss_host || !anonymousKey) throw new Error('InsForge project URL or anonymous key is missing.')

  const publicEnv = {
    NEXT_PUBLIC_INSFORGE_URL: project.oss_host,
    NEXT_PUBLIC_INSFORGE_ANON_KEY: anonymousKey,
  }
  fs.writeFileSync(flyConfig, [
    'primary_region = "sin"',
    '',
    '[build]',
    '  dockerfile = "Dockerfile"',
    '',
    '[build.args]',
    ...Object.entries(publicEnv).map(([key, value]) => `  ${key} = ${JSON.stringify(value)}`),
    '',
    '[http_service]',
    '  internal_port = 3000',
    '  force_https = true',
    '  auto_stop_machines = "stop"',
    '  auto_start_machines = true',
    '  min_machines_running = 0',
    '',
  ].join('\n'), { mode: 0o600 })

  try {
    const args = [
      'compute', 'deploy', '.', '--name', serviceName,
      '--port', '3000', '--cpu', 'shared-1x', '--memory', '512', '--region', 'sin', '--json',
    ]
    if (fs.existsSync(runtimeFile)) args.push('--env-file', runtimeFile)
    const result = spawnSync(process.execPath, [npxCli, ...cliArgs, ...args], {
      stdio: 'inherit', env: deployEnv,
    })
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
  } finally {
    fs.unlinkSync(flyConfig)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
