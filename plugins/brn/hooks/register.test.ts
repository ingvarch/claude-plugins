import { expect, test } from 'claude-code/testing'

type On = Parameters<Parameters<typeof test>[1] extends (...a: infer A) => unknown ? (...a: A) => unknown : never>[1]

const CARD = ';brn1 .fact !dec ~trap ?open\n=demo go1.24 api :: ledger\n@s=internal/\n.1 config env-only #infra\n'
const NOW = '> ship v2\n= tests red @261013\n- fix cursor list.go:71\n'
const TRAPS = '~1 goose w/o -dir prints no migrations and exits 0 #db\n~2 golangci errcheck false-pos @s/users/list.go:40 #ci\n'
const base = { sections: [{ id: 'intro', text: 'hi', scope: 'shared' as const }] }
const compose = { model: 'claude-fable-5-1', promptModel: 'claude-fable-5-1', surfaces: ['terminal' as const], tools: [], outputStyle: null, traits: [] }
const EDIT = { result: { filePath: 'x', oldString: 'x', newString: 'y', originalFile: 'x', structuredPatch: [], userModified: false, replaceAll: false } as never }
const turn = { reason: 'answer' as const, answer: 'done', durationMs: 10, isAborted: false, turnId: 't1' }

// A brain on a fake filesystem. Returns the file map so tests can inspect writes.
function brainFs(on: On, files: Record<string, string> = {}) {
  const fs: Record<string, string> = { '/proj/.brain/card': CARD, '/proj/.brain/now': NOW, '/proj/.brain/traps': TRAPS, '/proj/.brain/facts': '', '/proj/.brain/dec': '', '/proj/.brain/log': '', ...files }
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.exists', (_, e) => ({ value: e.path in fs }))
  on('fs.read', (_, e) => {
    if (!(e.path in fs)) throw new Error(`ENOENT ${e.path}`)
    return { value: fs[e.path] }
  })
  on('fs.write', (_, e) => ((fs[e.path] = e.text), { value: undefined }))
  return fs
}

test('prompt.compose appends card+now and freezes the snapshot for the session', async ($, on) => {
  const fs = brainFs(on)
  on('prompt.compose', () => base)
  let r = await $.prompt.compose(compose)
  const s = r.sections.find(x => x.id === 'brn:brain')!
  expect(s.scope).toBe('session')
  expect(s.text).toContain('=demo go1.24 api')
  expect(s.text).toContain('- fix cursor list.go:71')
  expect(s.text).not.toContain('graphify')
  fs['/proj/.brain/now'] = '> changed\n= later @261014\n'
  r = await $.prompt.compose(compose)
  expect(r.sections.find(x => x.id === 'brn:brain')!.text).toContain('- fix cursor list.go:71')
})

test('session.compact refreshes the snapshot and asks the summary to keep handover state', async ($, on) => {
  const fs = brainFs(on)
  on('prompt.compose', () => base)
  let instructions = ''
  on('session.compact', (_, e) => ((instructions = e.instructions ?? ''), { messages: e.messages }))
  await $.prompt.compose(compose)
  fs['/proj/.brain/now'] = '> changed\n= later @261014\n'
  await $.session.compact({ trigger: 'manual', instructions: 'focus on tests', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as never)
  expect(instructions).toContain('focus on tests')
  expect(instructions).toContain('brn handover state')
  const r = await $.prompt.compose(compose)
  expect(r.sections.find(x => x.id === 'brn:brain')!.text).toContain('> changed')
})

test('graphify-out/graph.json switches on the graph protocol and the subagent hint', async ($, on) => {
  brainFs(on, { '/proj/graphify-out/graph.json': '{}' })
  on('prompt.compose', () => base)
  let seen = ''
  on('agent.spawn', (_, e) => ((seen = e.prompt), { model: 'claude-haiku-5-5' }))
  const r = await $.prompt.compose(compose)
  expect(r.sections.find(x => x.id === 'brn:brain')!.text).toContain('graphify query')
  await $.agent.spawn({ subagentType: 'Explore', prompt: 'find how #db migrations run', description: 'db' })
  expect(seen.startsWith(';brn1')).toBe(true)
  expect(seen).toContain('~1 goose')
  expect(seen).toContain('graphify path A B')
  expect(seen).toContain('TASK:\nfind how #db migrations run')
})

test('prompt.compose leaves the prompt alone without .brain', async ($, on) => {
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.exists', () => ({ value: false }))
  on('prompt.compose', () => base)
  const r = await $.prompt.compose(compose)
  expect(r.sections.map(x => x.id)).toEqual(['intro'])
})

test('Bash gets matching traps once; Edit matches traps through path aliases', async ($, on) => {
  brainFs(on)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  let r = await $.tool.call({ tool: 'Bash', command: 'goose -dir migrations up' })
  expect(r.context?.join('\n')).toContain('~1 goose')
  expect(r.context?.join('\n')).not.toContain('~2')
  r = await $.tool.call({ tool: 'Bash', command: 'goose status' })
  expect(r.context ?? []).toEqual([])
  r = await $.tool.call({ tool: 'Edit', file_path: '/proj/internal/users/list.go', old_string: 'a', new_string: 'b' })
  expect(r.context?.join('\n')).toContain('~2 golangci')
})

test('tags and words shared by many traps do not trigger traps', async ($, on) => {
  const many = Array.from({ length: 10 }, (_, i) => `~${i + 1} plugin quirk number ${i} about thing${i} #plugin #test`).join('\n') + '\n'
  brainFs(on, { '/proj/.brain/traps': many })
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  let r = await $.tool.call({ tool: 'Bash', command: 'claude plugin test plugins/x' })
  expect(r.context ?? []).toEqual([])
  r = await $.tool.call({ tool: 'Bash', command: 'make thing7' })
  expect(r.context?.join('\n')).toContain('~8 plugin quirk')
})

test('one plain word from code does not pick a trap; a program, identifier or two words do', async ($, on) => {
  const traps = '~1 test fixtures: tool.call answers { result }, ops answer { value } #plugin\n~2 claude -p waits on stdin from a script #plugin\n~3 goose prints no migrations #db\n'
  brainFs(on, { '/proj/.brain/traps': traps })
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  let r = await $.tool.call({ tool: 'Bash', command: 'python3 -c "\nresult = detect(x)\nprint(result)\nline = sys.stdin.readline()\n"' })
  expect(r.context ?? []).toEqual([])
  r = await $.tool.call({ tool: 'Bash', command: 'cd x && goose up' })
  expect(r.context?.join('\n')).toContain('~3 goose')
  r = await $.tool.call({ tool: 'Bash', command: 'grep -rn tool.call hooks/' })
  expect(r.context?.join('\n')).toContain('~1 test fixtures')
  r = await $.tool.call({ tool: 'Bash', command: 'echo "read stdin in the script"' })
  expect(r.context?.join('\n')).toContain('~2 claude -p')
})

test('Agent results with brn record lines are appended as unverified, deduplicated', async ($, on) => {
  const fs = brainFs(on)
  const report = 'Found it.\n. redis only for rate limit, keys rl:{ip} #api\n~ tests hang if REDIS_URL unset -> export it #test\n. config env-only #infra\n- not a record\n'
  on('tool.call', () => ({ result: { agentId: 'a1', content: [{ type: 'text', text: report }], totalToolUseCount: 0, totalDurationMs: 0, totalTokens: 0, usage: {} } as never }))
  const r = await $.tool.call({ tool: 'Agent', prompt: 'look', description: 'x' })
  expect(fs['/proj/.brain/facts']).toBe('.2 redis only for rate limit, keys rl:{ip} #api ?\n')
  expect(fs['/proj/.brain/traps']).toContain('~3 tests hang if REDIS_URL unset -> export it #test ?\n')
  expect(r.context?.join('\n')).toContain('appended 2 unverified')
})

test('a background subagent records land at SubagentStop and are reported on the next Bash result', async ($, on) => {
  const fs = brainFs(on)
  on('classic.SubagentStop', () => ({}))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  const report = 'Done.\n. graph has 100 nodes #graphify\n~ setup.md still shells to bin/brn init #plugin\n'
  await $.classic.SubagentStop({ stop_hook_active: false, agent_id: 'a1', agent_transcript_path: '', agent_type: 'general-purpose', last_assistant_message: report })
  expect(fs['/proj/.brain/facts']).toBe('.2 graph has 100 nodes #graphify ?\n')
  expect(fs['/proj/.brain/traps']).toContain('~3 setup.md still shells to bin/brn init #plugin ?\n')
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(r.context?.join('\n')).toContain('appended 2 unverified record(s) from subagents: .2 ~3')
  const again = await $.tool.call({ tool: 'Bash', command: 'pwd' })
  expect(again.context ?? []).toEqual([])
})

test('the brain tool adds, logs, slices and lints', async ($, on) => {
  const fs = brainFs(on)
  on('tool.call', () => ({ result: 'unused' as never }))
  let r = await $.tool.call({ tool: 'mcp__brn__brain', op: 'add', sigil: '!', text: 'pg over sqlite :: writers #db' } as never)
  expect(String(r.result)).toBe('!1 -> .brain/dec')
  expect(fs['/proj/.brain/dec']).toBe('!1 pg over sqlite :: writers #db\n')
  r = await $.tool.call({ tool: 'mcp__brn__brain', op: 'log', text: '+handlers -tests' } as never)
  expect(String(r.result)).toMatch(/^@\d{6} \+handlers -tests$/)
  r = await $.tool.call({ tool: 'mcp__brn__brain', op: 'slice', tags: ['#db'] } as never)
  expect(String(r.result)).toContain('~1 goose')
  expect(String(r.result)).toContain('!1 pg over sqlite')
  fs['/proj/.brain/facts'] = '.9 ' + 'x'.repeat(150) + ' ^!7\n'
  r = await $.tool.call({ tool: 'mcp__brn__brain', op: 'lint' } as never)
  expect(String(r.result)).toContain('>140 chars')
  expect(String(r.result)).toContain('dangling ref: ^!7')
})

test('turn.complete after edits submits the brain update once, naming the files', async ($, on) => {
  brainFs(on)
  on('tool.call', () => EDIT)
  const submitted: string[] = []
  on('prompt.submit', (_, e) => (submitted.push(e.text), { text: e.text }))
  on('turn.complete', () => ({ text: 'done' }))
  await $.turn.complete(turn)
  expect(submitted.length).toBe(0)
  await $.tool.call({ tool: 'Edit', file_path: '/proj/a.go', old_string: 'x', new_string: 'y' })
  await $.turn.complete(turn)
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('Files edited last turn: a.go')
  await $.turn.complete(turn)
  expect(submitted.length).toBe(1)
})

test('turn.complete ignores aborted turns and respects minEdits', { options: { minEdits: 2 } }, async ($, on) => {
  brainFs(on)
  on('tool.call', () => EDIT)
  let n = 0
  on('prompt.submit', (_, e) => (n++, { text: e.text }))
  on('turn.complete', () => ({ text: 'done' }))
  await $.tool.call({ tool: 'Edit', file_path: '/proj/a.go', old_string: 'x', new_string: 'y' })
  await $.turn.complete({ ...turn, reason: 'aborted', isAborted: true })
  await $.turn.complete(turn)
  expect(n).toBe(0)
  await $.tool.call({ tool: 'Edit', file_path: '/proj/b.go', old_string: 'x', new_string: 'y' })
  await $.turn.complete(turn)
  expect(n).toBe(1)
})

test('/brn setup creates the skeleton and asks Claude to fill it', async ($, on) => {
  const fs = brainFs(on)
  delete fs['/proj/.brain/card']
  // The fill prompt goes out through $.prompt.submit; the live engine runs it
  // (verified headless), the test kit does not deliver a submit raised under command.run.
  on('prompt.submit', (_, e) => ({ text: e.text }))
  const r = await $.command.run({ command: 'brn', args: 'setup' })
  expect(r.text).toContain('created /proj/.brain/')
  expect(fs['/proj/.brain/card']?.startsWith(';brn1')).toBe(true)
  expect(fs['/proj/.brain/card']).toContain('=proj <stack>')
})

test('/brn with no args prints status and help', async ($, on) => {
  brainFs(on)
  const r = await $.command.run({ command: 'brn', args: '' })
  expect(r.text).toContain('.brain/ present')
  expect(r.text).toContain('graphify absent')
  expect(r.text).toContain('/brn:setup')
})

test('session.start registers the tool and adds .brain/ to the global git excludes once', async ($, on) => {
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.exists', () => ({ value: false }))
  on('env.get', () => ({ value: '/home/u' }))
  on('command.register', () => ({ value: undefined }))
  const tools: string[] = []
  on('tool.register', (_, e) => (tools.push(e.name), { value: { tool: `mcp__brn__${e.name}` } }))
  const argvs: string[][] = []
  on('process.run', (_, e) => (argvs.push([...e.argv]), { value: { exitCode: e.argv.includes('--get') ? 1 : 0, stdout: '', stderr: '' } }))
  const files: Record<string, string> = {}
  on('fs.read', (_, e) => {
    if (!(e.path in files)) throw new Error('ENOENT')
    return { value: files[e.path] }
  })
  on('fs.write', (_, e) => ((files[e.path] = e.text), { value: undefined }))
  on('session.start', () => ({ cwd: '/proj' }))
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  expect(tools).toEqual(['brain'])
  expect(files['/home/u/.config/git/ignore']).toBe('.brain/\n')
  expect(argvs.some(a => a.includes('core.excludesfile') && !a.includes('--get'))).toBe(true)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  expect(files['/home/u/.config/git/ignore']).toBe('.brain/\n')
})
