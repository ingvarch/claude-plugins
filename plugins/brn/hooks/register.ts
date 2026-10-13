import type { Engine, Register } from 'claude-code'
import { Brain, KEY, commandHeads, isSigil, matchTraps, needlesFromCommand, normalize, parseRecords, type Fs, type Sigil } from './brain'

const TOOL = 'mcp__brn__brain'

const HELP = [
  '/brn:setup     create .brain/ and let Claude fill it from the repo (once per project)',
  '/brn:end       hand over now: rewrite now, append log, add records, lint',
  '/brn           this status',
  'Automatic: card+now with the first prompt, traps shown at the moment of risk, subagents briefed and their',
  'brn records captured, brain updated after edits, graphify used for structure when present.',
  'Advanced: /brn slice|brief|add|log|lint|start|all',
].join('\n')

const TOOL_DESCRIPTION =
  'Project brain (.brain/, brn notation). ops: add {sigil ". ! ~ ?", text} appends a record with the next id; log {text} appends a dated session line; lint checks the brain; slice {tags} returns records by #tag; brief {tags} builds a subagent brief; status. Use it instead of editing .brain/facts, dec, traps or log by hand; .brain/now and card you rewrite with Write.'

const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    op: { type: 'string', enum: ['add', 'log', 'lint', 'slice', 'brief', 'status'] },
    sigil: { type: 'string', enum: ['.', '!', '~', '?'], description: 'add: . fact, ! decision, ~ trap, ? open question' },
    text: { type: 'string', description: 'add: record body (telegraphic, <=140 chars, #tags, ? if unverified); log: +done -left' },
    tags: { type: 'array', items: { type: 'string' }, description: 'slice/brief: #tags' },
  },
  required: ['op'],
}

const GRAPHIFY_PROTOCOL =
  'graphify-out/ is present: for structure (where is X, who calls Y, impact of a change) run `graphify query "<q>"`, `graphify path A B` or `graphify explain X` before grep or Read. Do not store structural facts in .brain, the graph has them; store only what the graph cannot know: decisions, traps, state, people, commands.'

const protocol = (graphify: boolean) =>
  [
    'Protocol: card+now below are the session-start snapshot of the project brain; .brain/ on disk is authoritative once you update it.',
    'Trust them over re-discovery; verify records marked ?. Matching traps are attached to tool results as you work.',
    `Records: tool ${TOOL} op=add {sigil,text} (next id assigned), op=log {text}, op=lint, op=slice {tags}. Area work: op=slice with the #tags.`,
    graphify ? GRAPHIFY_PROTOCOL : '',
    'Handover is yours to do, unasked, when a task is done or the person is wrapping up:',
    '(1) rewrite .brain/now fully: > goal, = state @yymmdd, @ hot paths, - next (verb first, first one runnable now), x blocked :: unblocker, ?N open.',
    '(2) op=log "+done +done -left ^refs". (3) op=add for every non-obvious . ! ~ ? learned: one claim per line, <=140 chars, telegraphic,',
    'path:line over prose, ? suffix if unverified, nothing the code or git already says. (4) op=lint.',
    'Subagents get the brief automatically; records they return as . ! ~ ? lines are appended as unverified (? suffix): verify, then drop the ?.',
  ]
    .filter(Boolean)
    .join('\n')

const endPrompt = () =>
  `Handover now (brn protocol). 1) Rewrite .brain/now completely for the next session: > goal, = state @yymmdd, @ hot paths, - next steps verb-first, x blocked, ?N open. 2) ${TOOL} op=log "+done -left ^refs". 3) ${TOOL} op=add for every non-obvious thing learned this session (. ! ~ ?); one claim per line, <=140 chars, ? if unverified. 4) ${TOOL} op=lint and fix what it reports. Reply with the new now and the log line only.`

const fillPrompt = () =>
  `Fill .brain/card for this project in brn notation (the key is the first line of the file; load the brn-notation skill if unsure). If graphify-out/GRAPH_REPORT.md exists read it first: its god nodes and clusters tell you which dirs deserve @ aliases and ;lex entries, and structural facts stay out of .brain because the graph has them. Read README, build files, CI config and entrypoints, then write .brain/card with Write: = identity line (name, stack :: one-line purpose), @ path aliases for the 3-6 most used dirs, $ commands (run, test, test one, lint, migrate, deploy), & owner and preferences, ;lex abbreviations for things you will name often, and 5-8 core . facts with #tags that are not obvious from ls or the README. Gotchas, past failures and environment quirks go to .brain/traps via ${TOOL} op=add sigil "~", not into card. Then write .brain/now with the current > goal and - next steps, and run ${TOOL} op=lint. Telegraphic, <=140 chars per line, no prose. Finish with a 3-line summary of what the brain now holds; if the repo has more than ~300 source files and no graphify-out/, add one line suggesting \`/graphify .\` for structure.`

const autoPrompt = (edited: readonly string[]) =>
  `Brain update (automatic, brn protocol). Files edited last turn: ${edited.join(', ') || '(unknown)'}. Update .brain/ only: (1) rewrite .brain/now if goal, state or next steps changed (= state @yymmdd, @ hot paths, - next verb-first); (2) if this closed a piece of work, ${TOOL} op=log "+done -left"; (3) ${TOOL} op=add for anything non-obvious learned (. ! ~ ?), ? suffix if unverified; verify or delete records ending in ? that you can now confirm. Touch no other files, ask no questions, ${TOOL} op=lint if you wrote anything. If nothing is worth recording, reply exactly: brain current. Otherwise reply in <=3 lines.`

type Snapshot = { card: string; now: string; graphify: boolean }
const TAG = /#[a-z][a-z0-9_-]*/g

function fsOf($: Engine): Fs {
  return {
    read: path => $.fs.read(path).then(String),
    exists: path => $.fs.exists(path),
    write: (path, text) => $.fs.write(path, text),
  }
}

async function brainOf($: Engine): Promise<Brain> {
  return new Brain(fsOf($), `${await $.session.cwd()}/.brain`)
}

async function readSnapshot($: Engine): Promise<Snapshot | null> {
  const cwd = await $.session.cwd()
  const brain = new Brain(fsOf($), `${cwd}/.brain`)
  if (!(await brain.exists())) return null
  const graphify = await $.fs.exists(`${cwd}/graphify-out/graph.json`).catch(() => false)
  return { card: await brain.read('card'), now: await brain.read('now'), graphify }
}

async function attachTraps(
  $: Engine,
  needles: readonly string[],
  ran: { context?: readonly string[] },
  shown: Set<string>,
  heads: readonly string[] = [],
): Promise<{ context?: readonly string[] }> {
  if (needles.length === 0) return ran
  const brain = await brainOf($)
  const hits = matchTraps(await brain.traps(), await brain.aliases(), needles, heads)
    .filter(t => !shown.has(t))
    .slice(0, 3)
  if (hits.length === 0) return ran
  for (const h of hits) shown.add(h)
  return { ...ran, context: [...(ran.context ?? []), `brn traps for this call:\n${hits.join('\n')}`] }
}

async function relativeTo($: Engine, path: string): Promise<string> {
  const cwd = await $.session.cwd()
  return path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path
}

function agentText(ran: unknown): string {
  const r = ran as { text?: unknown; result?: { content?: { type?: string; text?: string }[] } }
  if (typeof r.text === 'string') return r.text
  return (r.result?.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('\n')
}

// Appends the . ! ~ ? lines of a subagent's answer as unverified records, skipping known bodies; returns the new ids.
async function appendSubagentRecords($: Engine, answer: string): Promise<string[]> {
  const records = parseRecords(answer)
  if (records.length === 0) return []
  const brain = await brainOf($)
  if (!(await brain.exists())) return []
  const known = await brain.bodies().catch(() => new Set<string>())
  const added: string[] = []
  for (const { sigil, body } of records) {
    if (known.has(normalize(body))) continue
    known.add(normalize(body))
    const text = /\?\??\s*$/.test(body) ? body : `${body} ?`
    const out = await brain.add(sigil as Sigil, text).catch(() => null)
    if (out) added.push(out.split(' ')[0])
  }
  return added
}

async function ensureGlobalIgnore($: Engine): Promise<string | null> {
  const got = await $.process.run(['git', 'config', '--global', '--get', 'core.excludesfile'], { timeoutMs: 5_000 }).catch(() => null)
  const home = (await $.env.get('HOME')) ?? ''
  let path = got?.stdout.trim() ?? ''
  if (!path) {
    if (!home) return null
    path = `${home}/.config/git/ignore`
    await $.process.run(['git', 'config', '--global', 'core.excludesfile', path], { timeoutMs: 5_000 })
  } else if (path.startsWith('~/')) path = `${home}/${path.slice(2)}`
  const cur = await $.fs.read(path).then(String, () => '')
  if (/^\.brain\/?\s*$/m.test(cur)) return null
  await $.fs.write(path, `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}.brain/\n`)
  return path
}

type ToolInput = { op?: string; sigil?: string; text?: string; tags?: string[] }

async function serveTool($: Engine, input: ToolInput): Promise<string> {
  const brain = await brainOf($)
  if (!(await brain.exists())) return 'no .brain/ here: run /brn:setup first'
  switch (input.op) {
    case 'add': {
      if (!input.sigil || !isSigil(input.sigil) || !input.text?.trim()) return 'add needs sigil (. ! ~ ?) and text'
      return brain.add(input.sigil, input.text)
    }
    case 'log':
      return input.text?.trim() ? brain.log(input.text) : 'log needs text'
    case 'lint': {
      const { problems, info } = await brain.lint()
      return [...problems, ...info.map(i => `${i} (info)`), problems.length ? 'lint: fix the above' : 'lint ok'].join('\n')
    }
    case 'slice':
      return (await brain.slice(input.tags ?? [])).join('\n') || '(no records for those tags)'
    case 'brief':
      return brain.brief(input.tags ?? [])
    case 'status': {
      const all = await brain.readAll()
      return `card ${all.card.split('\n').filter(Boolean).length} lines, now ${all.now.split('\n').filter(Boolean).length}, facts ${all.facts.split('\n').filter(Boolean).length}, dec ${all.dec.split('\n').filter(Boolean).length}, traps ${all.traps.split('\n').filter(Boolean).length}, log ${all.log.split('\n').filter(Boolean).length}`
    }
    default:
      return 'ops: add, log, lint, slice, brief, status'
  }
}

export const register: Register = (on, options) => {
  const autoHandover = options.autoHandover !== false
  const minEdits = typeof options.minEdits === 'number' && options.minEdits > 0 ? options.minEdits : 1
  const globalIgnore = options.globalIgnore !== false
  const captureRecords = options.captureSubagentRecords !== false
  const trapsAtRisk = options.trapsAtRisk !== false

  let snapshot: Snapshot | null = null
  let attached = false
  let editsSinceNow = 0
  let editedPaths = new Set<string>()
  let handoverPending = false
  const shownTraps = new Set<string>()

  on('session.start', async ($, e, next) => {
    attached = false
    await $.command.register({ name: 'brn', description: 'Project brain: setup once, then forget. /brn:end hands over.', argumentHint: 'setup|end' })
    await $.tool.register({ name: 'brain', description: TOOL_DESCRIPTION, inputSchema: TOOL_SCHEMA, isDeferred: false })
    if (globalIgnore) {
      const written = await ensureGlobalIgnore($).catch(() => null)
      if (written) $.ui.toast(`brn: added .brain/ to ${written}`)
    }
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const text = await serveTool($, e as ToolInput).catch(err => `brain tool failed: ${String(err)}`)
    return { result: text as never }
  })

  // card+now ride the first prompt of the session (and the first after a compaction) as hidden context.
  // Not the system prompt: an organization's security plugin may bypass a user plugin's prompt.compose,
  // while prompt.submit context always lands, sits in the history once and stays cached.
  on('prompt.submit', async ($, e, next) => {
    if (attached) return next(e)
    attached = true
    snapshot = await readSnapshot($).catch(() => null)
    if (!snapshot) return next(e)
    const card = snapshot.card.trim()
    const text = ['# Project brain (.brain/, brn notation)', card.startsWith(';brn') ? '' : KEY, protocol(snapshot.graphify), '## card', card, '## now', snapshot.now.trim()]
      .filter(Boolean)
      .join('\n')
    return next({ ...e, context: [...(e.context ?? []), text] })
  })

  on('session.compact', async ($, e, next) => {
    snapshot = null
    attached = false
    shownTraps.clear()
    const keep = 'Keep the brn handover state verbatim: current goal, exact next step, blockers, files being edited, and any decisions or gotchas not yet written to .brain/.'
    return next({ ...e, instructions: e.instructions ? `${e.instructions}\n${keep}` : keep })
  })

  const noteEdit = (rel: string) => {
    if (/(^|\/)\.brain\//.test(rel)) {
      editsSinceNow = 0
      return
    }
    editsSinceNow += 1
    editedPaths.add(rel)
  }

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const rel = await relativeTo($, e.file_path)
    noteEdit(rel)
    const ran = await next(e)
    return trapsAtRisk ? attachTraps($, [rel.toLowerCase()], ran, shownTraps) : ran
  })
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const rel = await relativeTo($, e.file_path)
    noteEdit(rel)
    const ran = await next(e)
    return trapsAtRisk ? attachTraps($, [rel.toLowerCase()], ran, shownTraps) : ran
  })
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const ran = await next(e)
    if (!trapsAtRisk) return ran
    const rel = await relativeTo($, e.file_path)
    return attachTraps($, [rel.toLowerCase()], ran, shownTraps)
  })
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (/\.brain\//.test(e.command)) {
      editsSinceNow = 0
      return withCaptured(await next(e))
    }
    const ran = await next(e)
    const out = trapsAtRisk ? await attachTraps($, needlesFromCommand(e.command), ran, shownTraps, commandHeads(e.command)) : ran
    return withCaptured(out)
  })

  // Every subagent gets the brief: key + card + tag slice + now, then its task.
  on('agent.spawn', async ($, e, next) => {
    if (e.prompt.includes(';brn1')) return next(e)
    if (!snapshot) snapshot = await readSnapshot($).catch(() => null)
    if (!snapshot) return next(e)
    const brain = await brainOf($)
    const tags = Array.from(new Set(e.prompt.match(TAG) ?? []))
    const brief = await brain.brief(tags).catch(() => null)
    if (!brief) return next(e)
    const graph = snapshot.graphify ? '\nStructure: `graphify query "<q>"`, `graphify path A B`, `graphify explain X` before grep or Read.' : ''
    return next({ ...e, prompt: `${brief}${graph}\n\nTASK:\n${e.prompt}` })
  })

  // Records a subagent returns (. ! ~ ? lines without ids) land in the brain as unverified.
  // A subagent's own turn.complete (agentId set) and its SubagentHandback call carry its report, background
  // ones included, whose Agent call returns only "launched"; the ids wait and ride on the next Agent or Bash result.
  let captured: string[] = []
  const withCaptured = <R extends { context?: readonly string[] }>(ran: R): R => {
    if (captured.length === 0) return ran
    const note = `brn: appended ${captured.length} unverified record(s) from subagents: ${captured.join(' ')}. Verify and drop the ? suffix, or delete.`
    captured = []
    return { ...ran, context: [...(ran.context ?? []), note] }
  }

  // A subagent that reports through SubagentHandback ends on that tool call, so its report is the call's
  // message, not its final answer.
  on('tool.call', { tool: 'SubagentHandback' } as never, async ($: Engine, e: { message?: unknown }, next: (e: unknown) => Promise<{ context?: readonly string[] }>) => {
    if (captureRecords && typeof e.message === 'string') captured.push(...(await appendSubagentRecords($, e.message).catch(() => [])))
    return next(e)
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const ran = await next(e)
    if (!captureRecords || ran.deny !== undefined) return ran
    captured.push(...(await appendSubagentRecords($, agentText(ran)).catch(() => [])))
    return withCaptured(ran)
  })

  // After a turn that edited files, let the model update the brain itself.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if ((e as { agentId?: string }).agentId) {
      const answer = (e as { answer?: string }).answer
      if (captureRecords && e.reason === 'answer' && answer) captured.push(...(await appendSubagentRecords($, answer).catch(() => [])))
      return result
    }
    if (handoverPending) {
      handoverPending = false
      editsSinceNow = 0
      $.ui.status(undefined)
      return result
    }
    if (!autoHandover || e.reason !== 'answer' || editsSinceNow < minEdits) return result
    const brain = await brainOf($)
    if (!(await brain.exists().catch(() => false))) return result
    handoverPending = true
    const edited = Array.from(editedPaths).slice(0, 12)
    editedPaths = new Set()
    $.ui.status('brn: updating brain')
    void $.prompt.submit({ text: autoPrompt(edited) }).catch(() => {
      handoverPending = false
    })
    return result
  })

  on('command.run', { command: 'brn' }, async ($, e) => {
    const [sub = 'status', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const brain = await brainOf($)
    switch (sub) {
      case 'setup': {
        const made = (await brain.exists()) ? '.brain/ exists, refilling card' : await brain.init(rest[0] ?? (await $.session.cwd()).split('/').pop() ?? 'project')
        snapshot = null
        await $.prompt.submit({ text: fillPrompt() }).catch(() => undefined)
        return { text: `${made}\nClaude is filling .brain/card and .brain/now from the repo.` }
      }
      case 'end':
        await $.prompt.submit({ text: endPrompt() }).catch(() => undefined)
        return { text: 'Handover requested: now, log, new records, lint.' }
      case 'status':
      case 'help': {
        const snap = await readSnapshot($).catch(() => null)
        const state = snap
          ? `.brain/ present, ${snap.card.split('\n').filter(Boolean).length} card lines, ${editsSinceNow} edits since now was rewritten, graphify ${snap.graphify ? 'detected' : 'absent'}, ${shownTraps.size} traps shown this session`
          : 'no .brain/ here, run /brn:setup'
        return { text: `${state}\n${HELP}` }
      }
      case 'start': {
        const out = `${await brain.read('card')}\n${await brain.read('now')}`.trim()
        return { text: out, context: [out] }
      }
      case 'brief': {
        const out = await brain.brief(rest)
        return { text: out, context: [out] }
      }
      case 'add': {
        const [sigil, ...body] = rest
        if (!sigil || !isSigil(sigil) || body.length === 0) return { text: 'usage: /brn add <sigil> <text>   sigil: . ! ~ ?' }
        return { text: await brain.add(sigil, body.join(' ')) }
      }
      case 'log':
        return { text: await brain.log(rest.join(' ')) }
      case 'slice':
        return { text: (await brain.slice(rest)).join('\n') || '(no records)' }
      case 'lint':
        return { text: await serveTool($, { op: 'lint' }) }
      case 'all': {
        const all = await brain.readAll()
        return { text: Object.entries(all).map(([f, t]) => `;-- ${f}\n${t.trim()}`).join('\n') }
      }
      default:
        return { text: HELP }
    }
  })
}
