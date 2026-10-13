// brn brain logic over a minimal filesystem interface. No engine access here:
// register.ts adapts `$` into `Fs` and passes it down.

export type Fs = {
  read: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
  write: (path: string, text: string) => Promise<void>
}

export const KEY =
  ';brn1 .fact !dec ~trap ?open >goal =state -next xblock +done @path $cmd &who %num ^ref ::why ->then <supersedes ?=unsure #tag @yymmdd'

export const FILES = ['card', 'now', 'log', 'facts', 'dec', 'traps'] as const
export type BrainFile = (typeof FILES)[number]
export type Sigil = '.' | '!' | '~' | '?'

const SIGIL_FILE: Record<Sigil, BrainFile> = { '.': 'facts', '!': 'dec', '~': 'traps', '?': 'now' }
const ID = /^([.!~?])(\d+)/
const REF = /\^([.!~?])(\d+)/g
const ALIAS = /@([a-z][a-z0-9]*)=(\S+)/g

export const today = (d = new Date()): string =>
  `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

export const isSigil = (s: string): s is Sigil => s === '.' || s === '!' || s === '~' || s === '?'

export class Brain {
  constructor(
    private readonly fs: Fs,
    readonly dir: string,
  ) {}

  path(f: BrainFile): string {
    return `${this.dir}/${f}`
  }

  exists(): Promise<boolean> {
    return this.fs.exists(this.path('card'))
  }

  read(f: BrainFile): Promise<string> {
    return this.fs.read(this.path(f)).catch(() => '')
  }

  async readAll(): Promise<Record<BrainFile, string>> {
    const out = {} as Record<BrainFile, string>
    for (const f of FILES) out[f] = await this.read(f)
    return out
  }

  async init(name: string): Promise<string> {
    if (await this.exists()) return `${this.dir} exists`
    await this.fs.write(this.path('card'), `${KEY}\n=${name} <stack> :: <one line>\n@s=src/\n$test <cmd> | $run <cmd>\n&owner <name> :: <prefs>\n`)
    await this.fs.write(this.path('now'), `> <goal>\n= fresh brain @${today()}\n- read README, fill card\n`)
    for (const f of ['log', 'facts', 'dec', 'traps'] as const) await this.fs.write(this.path(f), '')
    return `created ${this.dir}/`
  }

  async nextId(sigil: Sigil): Promise<number> {
    const all = await this.readAll()
    let max = 0
    for (const text of Object.values(all))
      for (const line of text.split('\n')) {
        const m = line.match(ID)
        if (m && m[1] === sigil) max = Math.max(max, Number(m[2]))
      }
    return max + 1
  }

  async add(sigil: Sigil, body: string): Promise<string> {
    const f = SIGIL_FILE[sigil]
    const id = `${sigil}${await this.nextId(sigil)}`
    const cur = await this.read(f)
    await this.fs.write(this.path(f), `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}${id} ${body.trim()}\n`)
    return `${id} -> .brain/${f}`
  }

  async log(text: string): Promise<string> {
    const line = `@${today()} ${text.trim()}`
    const cur = await this.read('log')
    await this.fs.write(this.path('log'), `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}${line}\n`)
    return line
  }

  async slice(tags: readonly string[]): Promise<string[]> {
    if (tags.length === 0) return []
    const all = await this.readAll()
    const out: string[] = []
    for (const f of ['card', 'facts', 'dec', 'traps', 'now'] as const)
      for (const line of all[f].split('\n')) if (line && tags.some(t => line.includes(t))) out.push(line)
    return out
  }

  async brief(tags: readonly string[]): Promise<string> {
    const all = await this.readAll()
    const card = all.card.trim()
    const parts = [card.startsWith(';brn') ? '' : KEY, card]
    const sl = await this.slice(tags)
    if (sl.length) parts.push(';-- slice', ...sl)
    parts.push(';-- now', all.now.trim(), 'RETURN: brn records only (. ! ~ ? lines, no ids, no prose), <=15 lines.')
    return parts.filter(Boolean).join('\n')
  }

  async aliases(): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    for (const m of (await this.read('card')).matchAll(ALIAS)) out[m[1]] = m[2]
    return out
  }

  async traps(): Promise<string[]> {
    return (await this.read('traps')).split('\n').filter(l => l.startsWith('~'))
  }

  async bodies(): Promise<Set<string>> {
    const all = await this.readAll()
    const out = new Set<string>()
    for (const text of Object.values(all))
      for (const line of text.split('\n')) {
        const m = line.match(/^[.!~?]\d* (.*)$/)
        if (m) out.add(normalize(m[1]))
      }
    return out
  }

  async lint(now = new Date()): Promise<{ problems: string[]; info: string[] }> {
    const all = await this.readAll()
    const problems: string[] = []
    const info: string[] = []
    const ids = new Set<string>()
    let unverified = 0
    for (const f of FILES) {
      const lines = all[f].split('\n')
      lines.forEach((line, i) => {
        if (!line.trim()) return
        if (line.length > 140) problems.push(`${f}:${i + 1}: >140 chars`)
        if (!/^[.!~?>=\-x+@$&%^;]/.test(line)) problems.push(`${f}:${i + 1}: bad sigil: ${line[0]}`)
        const m = line.match(ID)
        if (m) {
          if (ids.has(m[0])) problems.push(`dup id: ${m[0]}`)
          ids.add(m[0])
        }
        if (/ \?\??\s*$/.test(line)) unverified += 1
      })
    }
    for (const f of FILES)
      for (const m of all[f].matchAll(REF)) if (!ids.has(`${m[1]}${m[2]}`)) problems.push(`dangling ref: ^${m[1]}${m[2]}`)
    const d = all.now.match(/@(\d{6})/)
    if (!d) problems.push("now: no @yymmdd on '=' line")
    else {
      const at = new Date(2000 + Number(d[1].slice(0, 2)), Number(d[1].slice(2, 4)) - 1, Number(d[1].slice(4, 6)))
      const age = Math.floor((now.getTime() - at.getTime()) / 86_400_000)
      if (age > 7) problems.push(`now is ${age}d old: re-verify first '-'`)
    }
    const cardLines = all.card.split('\n').filter(Boolean).length
    if (cardLines > 40) info.push(`card has ${cardLines} lines (>40): move long-tail facts to .brain/facts`)
    const startTok = Math.round((all.card.length + all.now.length) / 3.1)
    if (startTok > 1000) info.push(`card+now ~${startTok} tokens (>1000): trim`)
    if (unverified) info.push(`unverified records: ${unverified}`)
    return { problems, info }
  }
}

export function normalize(body: string): string {
  return body.replace(/\s+\?\??\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function expandAliases(line: string, aliases: Record<string, string>): string {
  return line.replace(/@([a-z][a-z0-9]*)\//g, (m, a: string) => (aliases[a] ? `${aliases[a].replace(/\/$/, '')}/` : m))
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'then', 'echo', 'cat', 'sed', 'awk', 'grep', 'head', 'tail', 'sort', 'uniq', 'true',
  'false', 'null', 'run', 'exec', 'xargs', 'sudo', 'pwd', 'which', 'env', 'export', 'printf', 'find', 'cut', 'mkdir',
  'touch', 'tee', 'dev', 'bash', 'bin', 'usr', 'tmp', 'var', 'opt', 'python3', 'python', 'git', 'add', 'commit', 'status',
  'diff', 'log', 'show', 'users', 'igor', 'repos', 'home', 'claude', 'description', 'text', 'file', 'files', 'path',
])

export function needlesFromCommand(command: string): string[] {
  return Array.from(
    new Set(
      command
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/)
        .map(w => w.replace(/^[./-]+|[./-]+$/g, ''))
        .filter(w => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)),
    ),
  )
}

// Words that occur only inside a quoted phrase or a heredoc (`-m "fix prompt.submit"`, `query "who calls X"`,
// `commit -F - <<EOF`): text the command carries, not what it touches, so they count as plain words even when
// they look like identifiers.
export function proseWords(command: string): string[] {
  const heredocs = Array.from(command.matchAll(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n\s*\2(?=\s|$)/g), m => m[3])
  const quoted = command.match(/"(?:[^"\\\n]|\\.)*"|'[^'\n]*'/g) ?? []
  const prose = [...heredocs, ...quoted.filter(q => /\s/.test(q.slice(1, -1)))]
  if (prose.length === 0) return []
  let rest = command
  for (const q of prose) rest = rest.replace(q, ' ')
  const outside = new Set(needlesFromCommand(rest))
  return needlesFromCommand(prose.join(' ')).filter(w => !outside.has(w) && !w.includes('/'))
}

// Runners whose real program is the next word: `python3 -m unittest`, `git push`, `npx eslint`, `go test`.
const RUNNERS = new Set(['python', 'python3', 'node', 'uv', 'uvx', 'npx', 'bunx', 'bun', 'npm', 'pnpm', 'yarn', 'git', 'go', 'cargo', 'docker', 'kubectl'])

// The program each command segment runs (`goose`, `make`, `golangci-lint`): a strong needle even as a plain word.
export function commandHeads(command: string): string[] {
  const heads = new Set<string>()
  for (const seg of command.toLowerCase().split(/\n|\||;|&&|\$\(|`/)) {
    const words = seg.trim().replace(/^(?:[a-z_][a-z0-9_]*=\S*\s+|sudo\s+|env\s+|time\s+|exec\s+)*/, '').split(/\s+/)
    const m = words[0]?.match(/^([a-z0-9][a-z0-9_.-]*)(.?)/)
    // `x = ...` and `f(...)` are code inside a heredoc or -c string, not a program.
    if (!m || m[2] === '(' || words[1] === '=' || m[2] === '=') continue
    if (!STOP.has(m[1])) heads.add(m[1])
    if (!RUNNERS.has(m[1])) continue
    // The first word after the runner's flags (`-m` included); a quoted `-c` script or a path ends the search.
    const sub = words.slice(1).find(w => !w.startsWith('-'))
    if (sub && /^[a-z0-9][a-z0-9_.-]*$/.test(sub) && !STOP.has(sub)) heads.add(sub)
  }
  return Array.from(heads)
}

// Strong: a path, a file, an identifier (tool.call, REDIS_URL, rs256), a program name. One strong hit picks a trap;
// plain words like `result` or `words` show up in any code, so a trap needs two of them.
export function matchTraps(
  traps: readonly string[],
  aliases: Record<string, string>,
  needles: readonly string[],
  heads: readonly string[] = [],
  weak: readonly string[] = [],
): string[] {
  if (needles.length === 0 || traps.length === 0) return []
  // Tags and dates are metadata, not content; match whole words or path tails only.
  const hays = traps.map(t => expandAliases(t, aliases).replace(/#[a-z][\w-]*/gi, ' ').replace(/@\d{6}/g, ' ').toLowerCase())
  const words = hays.map(h => new Set(h.split(/[^a-z0-9_./-]+/).map(w => w.replace(/^[./-]+|[./-]+$/g, ''))))
  const hitBy = (n: string): number[] => {
    const out: number[] = []
    hays.forEach((h, i) => {
      if (n.includes('/')) {
        const segs = n.split('/')
        const tails = [n, ...segs.map((_, k) => segs.slice(k).join('/')).filter(t => t.includes('/') || /\.[a-z0-9]+$/.test(t))]
        if (tails.some(t => t.length >= 4 && h.includes(t))) out.push(i)
      } else if (words[i].has(n)) out.push(i)
    })
    return out
  }
  const strong = (n: string) => !weak.includes(n) && (/[./_0-9-]/.test(n) || heads.includes(n))
  // A needle that hits many traps does not discriminate (e.g. a word every trap shares): drop it.
  const limit = Math.max(2, Math.ceil(traps.length * 0.2))
  const score = new Map<number, number>()
  for (const n of needles) {
    if (n.length < 4) continue
    const hits = hitBy(n)
    if (hits.length > limit) continue
    for (const i of hits) score.set(i, (score.get(i) ?? 0) + (strong(n) ? 2 : 1))
  }
  return traps.filter((_, i) => (score.get(i) ?? 0) >= 2)
}

export const RECORD = /^([.!~?]) (\S.*)$/

export function parseRecords(text: string): { sigil: Sigil; body: string }[] {
  const out: { sigil: Sigil; body: string }[] = []
  for (const raw of text.split('\n')) {
    const m = raw.trim().match(RECORD)
    if (m && isSigil(m[1])) out.push({ sigil: m[1], body: m[2] })
  }
  return out.slice(0, 15)
}
