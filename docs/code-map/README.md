# The code map

A graph of HealthCal's TypeScript, kept in git as plain text so that no session has to index
anything: read it with grep. It is written by `node scripts/dev/code-map.mjs` from the sources
alone (the TypeScript compiler's parser, syntax only), and `src/codeMap.test.ts` fails while
these files are not what the sources give. Do not edit them by hand.

## The files

Every file is tab-separated, one record per line, sorted, with paths relative to the repository
root.

- `exports.tsv`: one line per exported name. `file  name  kind`, sorted by file and name. There
  is no line number on purpose (an edit above an export would make the map stale): find the line
  with `grep -n` in the file. The kind is `function`,
  `const` (also `let` and `var`), `class`, `type`, `interface`, `enum`, `namespace`,
  `component` (a function, or a const set to an arrow function, a function expression or a call
  such as `forwardRef(...)`, whose name starts with a capital and has a small letter, in a .tsx
  file) or `default` (`export default ...`, name `default`). A name passed on from another file is
  `re-export` with a fourth field, the `file:name` that really defines it (`?` when nothing does),
  and `export * from` is one line with name `*`, kind `re-export-all` and the file it passes on.
  A name exported both as a type and as a value has a line for each.
- `uses.tsv`: one line per defined name that some file imports: `file  name  count  importers...`,
  the defining file (after following re-exports), the name, how many files import it, and those
  files, tests (`*.test.ts`) last. This is "who uses X". A name with no line here is imported by
  no file (an expo-router screen's `default` is used by the router, not by an import).
- `imports.tsv`: one line per file: `file  dependencies...`, the project files it depends on.
  Read left to right it is "what does X depend on"; grep for X anywhere but the first field and
  it is "what breaks if X changes".

## Searches

Who uses `hasFoodLogged` (the defining file comes first; then the count and the files):

    grep -P '\thasFoodLogged\t' docs/code-map/uses.tsv

What `src/app/water.tsx` depends on, one per line:

    grep -P '^src/app/water.tsx\t' docs/code-map/imports.tsv | tr '\t' '\n' | tail -n +2

What depends on `src/lib/hydration.ts` (directly):

    grep -P '\tsrc/lib/hydration.ts(\t|$)' docs/code-map/imports.tsv | cut -f1

Every exported component of the UI kit:

    grep -P '^src/ui/[^\t]*\t[^\t]*\tcomponent$' docs/code-map/exports.tsv | cut -f1,2

Where a name is defined (any file, any kind):

    grep -P '^[^\t]*\tuseToday\t' docs/code-map/exports.tsv

Everything that depends on a file, through any number of files in between (screens first, each
with how many steps away it is). This one is worked out from the sources, in about 2 s:

    node scripts/dev/code-map.mjs --dependents=src/features/morning/rule.ts

## How the map reads the code

- Files: every `.ts` and `.tsx` under `src/` and `supabase/functions/` (no `node_modules`, no
  hidden folders). Tests are ordinary files; they are told apart by their name, `*.test.ts`.
- Paths: relative (`./x`, `../x`), `@/assets/...` (the `assets/` folder) and `@/...` (`src/`), as in
  tsconfig.json. A path with `.ts` or `.tsx` (the edge functions write them) is taken as written.
  Otherwise `x.ts`, `x.tsx` and the platform files `x.android`, `x.ios`, `x.native`, `x.web`
  (each `.ts` or `.tsx`), and if none exists the same for `x/index`.
- Platform files: each is its own file in the map. An import of the bare name (`./adapter`) is
  recorded as an import of every file Metro could pick for it: the plain file and each platform
  file that exists (`adapter.ts`, `adapter.android.ts`, `adapter.ios.ts`), and a name imported from
  it is used in each of them that defines it. An import that names a platform file itself
  (`./capture.native`) is that file only. The platform files now: `src/features/health-sync/adapter.android.ts`, `src/features/health-sync/adapter.ios.ts`, `src/features/share/capture.native.ts`, `src/features/updates/platform.native.ts`.
- Packages (`react`, `expo-router`, `node:fs`, `npm:`, `jsr:`, URLs) are not in the map.
- JSON, images and every other file that is not TypeScript are not nodes: an import of one
  (`import data from './x.json'`) adds nothing to the map. Today no source imports one.
- Re-exports are followed to the file that defines the name: `export { a as b } from`, `export *
  from` (never for `default`, as in TypeScript), and `export { x }` of a name the file imported. A
  use is recorded once, against the defining file and its own name, never against the index file
  in between; the index file still appears in the importer's line of `imports.tsv`.
- `imports.tsv` holds, for each file, every file its import and export statements name (index
  files included), plus the files that really define the names it takes through them. So an
  import of `Button` from `@/ui` puts both `src/ui/index.ts` and `src/ui/Button.tsx` on the line.
- Type-only imports (`import type`, `import { type X }`, `import('./x').X` in a type) count like
  any other: a change to the type can break the file.
- Default imports use the name `default` of the file they resolve to.
- Namespace imports (`import * as W from './words'`): the file gets a use of the name `*`, and
  every `W.name` (or `W.Type` in a type) read in the importing file is a use of `name`. A name the
  file reaches only in another way (`W[key]`, passing `W` along) is covered by the `*` line only.
  Local names that shadow `W` are not told apart.
- Side-effect imports (`import './x'`) and `vi.mock`/`vi.doMock`/`vi.importActual` with a literal
  path add a line to `imports.tsv` and no use. A `require('./x')` or `import('./x')` with a literal
  path is a use of `*`, and so are the names taken from it at once: `const { a, b } = await
  import('./x')`, `(await import('./x')).a`, and `const m = await import('./x')` read later as
  `m.a`. A module object passed along and read elsewhere is covered by the `*` line only, so
  before calling a name unused, look at its file's `*` line too. One with a computed path cannot
  be followed (1 today).
- What the map does not know: calls and references inside a file (it records which names a file
  imports, not where it uses them, or whether it does), names reached through a computed path or a
  computed key, uses by expo-router (every file under `src/app/` is a screen), and files outside
  `src/` and `supabase/functions/` (scripts, config, and the test stand-ins in `test/stubs/`: an
  import of one adds nothing, 1 today).

## Counts

742 files (234 of them tests), 3629 exported names (class 17, component 255, const 902, default 44, function 1727, interface 449, type 235),
208 re-export lines, 2879 names imported somewhere, 4316 file-to-file dependencies.

## Refreshing it

After adding, removing or renaming an export, changing what a file imports, or adding, moving or
deleting a file (an edit inside a function, a comment or a reformat changes nothing here):

    node scripts/dev/code-map.mjs           # writes docs/code-map/
    node scripts/dev/code-map.mjs --check   # what the test runs: exit 1 and what differs
    node scripts/dev/code-map.mjs --stats   # the counts and the time taken
    node scripts/dev/code-map.mjs --dependents=<file>   # all that depends on a file, screens first
