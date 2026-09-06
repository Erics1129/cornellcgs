#!/usr/bin/env node
/**
 * One-time: connect cornellcgs.org/admin to GitHub.
 *
 *   npm run admin:connect
 *
 * Asks for a fine-grained GitHub token that can write to the content repo
 * (and nothing else), encrypts it under the admin passcode, and commits the
 * result as admin-key.json in that repo. From then on any device that knows
 * the passcode can publish. Run it again to change the passcode or the token.
 *
 * Needs: Node 20+, the GitHub CLI (`gh`) signed in as someone who can write
 * to the content repo. Creates content.json and images/ if they are missing.
 *
 * Make the token here (Fine-grained, Only select repositories → the content
 * repo, Repository permissions → Contents: Read and write):
 *   https://github.com/settings/personal-access-tokens/new
 */
import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { webcrypto } from 'node:crypto'

const OWNER = 'Erics1129'
const REPO = 'cornellcgs-content'
const BRANCH = 'main'
const ITERATIONS = 600_000
const { subtle, getRandomValues } = webcrypto

const b64 = (bytes) => Buffer.from(bytes).toString('base64')

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) {
      const write = rl._writeToOutput.bind(rl)
      rl._writeToOutput = (s) => {
        if (s.includes(question)) write(question)
        else write('*'.repeat(0))
      }
    }
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'inherit'] }).trim()
}

async function ghFileSha(path) {
  try {
    return gh(['api', `repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, '--jq', '.sha'])
  } catch {
    return ''
  }
}

function ghPutFile(path, content, message) {
  const sha = ghFileSha(path)
  const body = JSON.stringify({ message, content: b64(Buffer.from(content, 'utf8')), branch: BRANCH, ...(sha ? { sha } : {}) })
  gh(['api', '-X', 'PUT', `repos/${OWNER}/${REPO}/contents/${path}`, '--input', '-', '--jq', '.content.path'], body)
}

async function main() {
  console.log(`\nConnecting cornellcgs.org/admin to github.com/${OWNER}/${REPO}\n`)

  try {
    gh(['auth', 'status'])
  } catch {
    console.error('The GitHub CLI is not signed in. Run: gh auth login')
    process.exit(1)
  }

  // the content repo, created if this is the very first time
  try {
    gh(['repo', 'view', `${OWNER}/${REPO}`, '--json', 'name'])
  } catch {
    console.log('Creating the content repo…')
    gh(['repo', 'create', `${OWNER}/${REPO}`, '--public', '--description', 'Words and photos for cornellcgs.org, published from cornellcgs.org/admin'])
  }
  if (!(await ghFileSha('content.json'))) ghPutFile('content.json', '{}\n', 'init content.json')
  if (!(await ghFileSha('images/.gitkeep'))) ghPutFile('images/.gitkeep', '', 'init images/')
  if (!(await ghFileSha('README.md'))) {
    ghPutFile(
      'README.md',
      `# cornellcgs.org content\n\nThe words and portraits shown on https://cornellcgs.org, edited at https://cornellcgs.org/admin/ and committed here.\n\n- content.json — the published document (only the sections that differ from the site's built-in words)\n- images/ — uploaded portraits, cropped square, named by content hash\n- admin-key.json — the admin's GitHub connection, encrypted under the admin passcode\n\nThe admin overwrites this repo; edit by hand only if you know what you are doing.\n`,
      'init README',
    )
  }

  console.log('Make a fine-grained token at https://github.com/settings/personal-access-tokens/new')
  console.log(`  Repository access: Only select repositories → ${REPO}`)
  console.log('  Repository permissions: Contents → Read and write (nothing else)\n')
  const token = await ask('Paste the token (hidden): ', { hidden: true })
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(token)) {
    console.error('That does not look like a GitHub token.')
    process.exit(1)
  }

  // does the token open the repo for writing?
  const check = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
  })
  if (!check.ok) {
    console.error(`GitHub rejected the token for ${OWNER}/${REPO} (HTTP ${check.status}).`)
    process.exit(1)
  }
  const perms = (await check.json()).permissions || {}
  if (perms.push === false) {
    console.error('That token can read the repo but not write to it — it needs Contents: Read and write.')
    process.exit(1)
  }

  const passcode = (await ask('Admin passcode [1234]: ')) || '1234'
  if (passcode.length < 4) {
    console.error('Use at least 4 characters.')
    process.exit(1)
  }
  if (passcode.length < 8) {
    console.log('  (A short passcode can be guessed by anyone who downloads admin-key.json — a longer one is safer.)')
  }

  // encrypt: PBKDF2-SHA256 → AES-256-GCM, exactly what src/admin/github.ts unlocks
  const salt = getRandomValues(new Uint8Array(16))
  const iv = getRandomValues(new Uint8Array(12))
  const base = await subtle.importKey('raw', new TextEncoder().encode(passcode.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
  const key = await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
  ])
  const data = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)))
  const blob = { v: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) }

  ghPutFile('admin-key.json', JSON.stringify(blob, null, 2) + '\n', 'Connect cornellcgs.org/admin')
  console.log(`\nConnected. Open https://cornellcgs.org/admin/ on any device and enter the passcode.\n`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
