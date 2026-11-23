#!/usr/bin/env node
// The code map: a graph of HealthCal's TypeScript kept in git as plain text
// (docs/code-map/). It is written by this script from the sources alone, with
// the TypeScript compiler's parser (ts.createSourceFile: syntax only, no type
// check), so it runs in about a second and needs nothing but node_modules.
//
//   node scripts/dev/code-map.mjs            write docs/code-map/ (same as --write)
//   node scripts/dev/code-map.mjs --check    write nothing; exit 1 and list what
//                                            differs when the committed map is stale
//   node scripts/dev/code-map.mjs --stats    print the counts and the time taken
//   node scripts/dev/code-map.mjs --dependents=<file>   every file that depends on
//                                            <file>, through any number of files,
//                                            screens (src/app/) first, with the
//                                            number of steps; writes nothing
//   --root=<dir>                             read and write another copy of the
//                                            repository (for proving the script)
//
// The same sources always give byte-identical files: everything is sorted by
// plain code-unit order, paths are relative with forward slashes, and nothing
// depends on the date, the machine or the order the disk lists files in.
// src/codeMap.test.ts runs --check, so the suite fails until the map is
// refreshed. The rules for every case are written into docs/code-map/README.md
// by this script (the `readme` function below), so the guide never drifts from
// the code.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const started = process.hrtime.bigint();
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith('--root='));
const ROOT = path.resolve(rootArg ? rootArg.slice('--root='.length) : path.join(here, '..', '..'));
const dependentsArg = args.find((a) => a.startsWith('--dependents='));
const mode = dependentsArg ? 'dependents' : args.includes('--check') ? 'check' : args.includes('--stats') ? 'stats' : 'write';
const unknown = args.filter((a) => !['--check', '--stats', '--write'].includes(a) && !a.startsWith('--root=') && !a.startsWith('--dependents='));
if (unknown.length) {
  console.error(`code-map: unknown argument ${unknown.join(' ')}`);
  process.exit(2);
}

// TypeScript from the project's own node_modules (the script's repository, so
// --root can point at a copy without one).
const require = createRequire(path.join(here, '..', '..', 'package.json'));
const ts = require('typescript');

const OUT_DIR = 'docs/code-map';
const SOURCE_DIRS = ['src', 'supabase/functions'];
const PLATFORMS = ['android', 'ios', 'native', 'web'];
const CODE_EXT = ['.ts', '.tsx'];
const FIX = 'The code map is out of date. Run: node scripts/dev/code-map.mjs';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = (xs) => [...new Set(xs)].sort(cmp);
const isTest = (f) => /\.test\.tsx?$/.test(f);
const testsLast = (a, b) => (isTest(a) === isTest(b) ? cmp(a, b) : isTest(a) ? 1 : -1);
const clean = (s) => String(s).replace(/[\t\r\n]+/g, ' ');

// ---------------------------------------------------------------- the files

function walk(dir, out) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const rel = `${dir}/${ent.name}`;
    if (ent.isDirectory()) walk(rel, out);
    else if (CODE_EXT.some((e) => ent.name.endsWith(e))) out.push(rel);
  }
}
const files = [];
for (const d of SOURCE_DIRS) walk(d, files);
files.sort(cmp);
const fileSet = new Set(files);

// ---------------------------------------------------------------- parsing

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
const hasMod = (node, kind) => (ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : []).some((m) => m.kind === kind);
const textOf = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);

function bindingNames(name, out) {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out);
  return out;
}

/** What one file declares, imports and exports, from its syntax alone. */
function parse(file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const tsx = file.endsWith('.tsx');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const info = {
    file,
    decls: new Map(), // top-level local name -> { kind, line }
    exports: new Map(), // exported name -> { kind, line } defined here
    aliases: [], // export { local as name } without `from`: { name, local, line }
    reexports: [], // export { imported as name } from spec: { name, imported, spec, line }
    stars: [], // export * from spec: { spec, line }
    imports: [], // { spec, how: static|side|dynamic|mock|type-import, names: [{ imported, local }], ns, line }
    computed: 0, // dynamic imports or require() with a computed path
  };
  const componentish = (name, init) =>
    tsx && /^[A-Z]/.test(name) && /[a-z]/.test(name) &&
    (init === undefined || ts.isArrowFunction(init) || ts.isFunctionExpression(init) || ts.isCallExpression(init));

  for (const st of sf.statements) {
    const exported = hasMod(st, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasMod(st, ts.SyntaxKind.DefaultKeyword);
    const line = lineOf(sf, st);
    const declare = (name, kind) => {
      if (!info.decls.has(name)) info.decls.set(name, { kind, line });
      if (exported && !isDefault && !info.exports.has(name)) info.exports.set(name, { kind, line });
    };
    if (ts.isFunctionDeclaration(st)) {
      if (isDefault) info.exports.set('default', { kind: 'default', line });
      if (st.name) declare(st.name.text, componentish(st.name.text) ? 'component' : 'function');
    } else if (ts.isClassDeclaration(st)) {
      if (isDefault) info.exports.set('default', { kind: 'default', line });
      if (st.name) declare(st.name.text, 'class');
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        for (const n of bindingNames(d.name, [])) declare(n, componentish(n, d.initializer) && ts.isIdentifier(d.name) ? 'component' : 'const');
      }
    } else if (ts.isTypeAliasDeclaration(st)) declare(st.name.text, 'type');
    else if (ts.isInterfaceDeclaration(st)) declare(st.name.text, 'interface');
    else if (ts.isEnumDeclaration(st)) declare(st.name.text, 'enum');
    else if (ts.isModuleDeclaration(st) && ts.isIdentifier(st.name)) declare(st.name.text, 'namespace');
    else if (ts.isExportAssignment(st)) info.exports.set('default', { kind: 'default', line });
    else if (ts.isImportDeclaration(st)) {
      const spec = textOf(st.moduleSpecifier);
      const clause = st.importClause;
      const imp = { spec, how: clause ? 'static' : 'side', names: [], ns: null, line };
      if (clause) {
        if (clause.name) imp.names.push({ imported: 'default', local: clause.name.text });
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) imp.ns = nb.name.text;
        else if (nb) for (const el of nb.elements) imp.names.push({ imported: (el.propertyName ?? el.name).text, local: el.name.text });
      }
      info.imports.push(imp);
    } else if (ts.isImportEqualsDeclaration(st) && ts.isExternalModuleReference(st.moduleReference)) {
      info.imports.push({ spec: textOf(st.moduleReference.expression), how: 'static', names: [], ns: st.name.text, line });
    } else if (ts.isExportDeclaration(st)) {
      const spec = st.moduleSpecifier ? textOf(st.moduleSpecifier) : null;
      const ec = st.exportClause;
      if (!ec) info.stars.push({ spec, line });
      else if (ts.isNamespaceExport(ec)) {
        info.exports.set(ec.name.text, { kind: 'namespace', line });
        info.imports.push({ spec, how: 'static', names: [], ns: `\0export:${ec.name.text}`, line, reexportOnly: true });
      } else {
        for (const el of ec.elements) {
          const name = el.name.text;
          const local = (el.propertyName ?? el.name).text;
          if (spec) info.reexports.push({ name, imported: local, spec, line });
          else info.aliases.push({ name, local, line });
        }
      }
    }
  }

  // Imports inside expressions (import(), require(), vi.mock()), import types,
  // and the names read through a namespace import (`W.coachLine`).
  const nsLocals = new Map(info.imports.filter((i) => i.ns && !i.reexportOnly).map((i) => [i.ns, new Set()]));
  // `import('./x')` or `require('./x')` with a literal path, seen through `await` and brackets.
  const dynamicSpec = (node) => {
    let n = node;
    while (n && (ts.isParenthesizedExpression(n) || ts.isAwaitExpression(n))) n = n.expression;
    if (!n || !ts.isCallExpression(n)) return null;
    const callee = n.expression;
    const isDynamic = callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require');
    return isDynamic ? textOf(n.arguments[0]) : null;
  };
  const visit = (node) => {
    // The names taken from a dynamic import: `const { a, b: c } = await import('./x')`,
    // `(await import('./x')).a`, and `const m = await import('./x')` read later as `m.a`.
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const spec = dynamicSpec(node.initializer);
      if (spec !== null && ts.isObjectBindingPattern(node.name)) {
        const names = node.name.elements
          .filter((el) => !el.dotDotDotToken && (!el.propertyName || ts.isIdentifier(el.propertyName) || ts.isStringLiteral(el.propertyName)))
          .map((el) => ({ imported: el.propertyName ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : null, local: null }))
          .filter((n) => n.imported !== null);
        if (names.length) info.imports.push({ spec, how: 'dynamic', names, ns: null, line: lineOf(sf, node) });
      } else if (spec !== null && ts.isIdentifier(node.name)) {
        info.imports.push({ spec, how: 'dynamic', names: [], ns: node.name.text, line: lineOf(sf, node) });
        if (!nsLocals.has(node.name.text)) nsLocals.set(node.name.text, new Set());
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      const spec = dynamicSpec(node.expression);
      if (spec !== null && node.expression !== undefined && !ts.isCallExpression(node.expression)) {
        info.imports.push({ spec, how: 'dynamic', names: [{ imported: node.name.text, local: null }], ns: null, line: lineOf(sf, node) });
      }
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const arg = node.arguments[0];
      let how = null;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) how = 'dynamic';
      else if (ts.isIdentifier(callee) && callee.text === 'require') how = 'dynamic';
      else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'vi' &&
        ['mock', 'doMock', 'unmock', 'doUnmock', 'importActual', 'importMock'].includes(callee.name.text)) how = 'mock';
      if (how && arg) {
        const spec = textOf(arg);
        if (spec !== null) info.imports.push({ spec, how, names: [], ns: how === 'dynamic' ? '\0dynamic' : null, line: lineOf(sf, node) });
        else if (how === 'dynamic') info.computed++;
      }
    } else if (ts.isImportTypeNode(node)) {
      const lit = ts.isLiteralTypeNode(node.argument) ? textOf(node.argument.literal) : null;
      if (lit !== null) {
        let q = node.qualifier;
        while (q && ts.isQualifiedName(q)) q = q.left;
        info.imports.push({ spec: lit, how: 'type-import', names: q ? [{ imported: q.text, local: null }] : [], ns: q ? null : '\0dynamic', line: lineOf(sf, node) });
      }
    } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && nsLocals.has(node.expression.text)) {
      nsLocals.get(node.expression.text).add(node.name.text);
    } else if (ts.isQualifiedName(node) && ts.isIdentifier(node.left) && nsLocals.has(node.left.text)) {
      nsLocals.get(node.left.text).add(node.right.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  for (const imp of info.imports) if (imp.ns && nsLocals.has(imp.ns)) imp.nsNames = [...nsLocals.get(imp.ns)].sort(cmp);
  return info;
}

const parsed = new Map(files.map((f) => [f, parse(f)]));

// ---------------------------------------------------------------- resolving

const notCode = new Map(); // spec -> [files] for project paths that are not TypeScript (JSON, images)
const unresolvedSpecs = new Map(); // `${file} -> ${spec}` for project paths that lead nowhere
const outside = new Set(); // `${file}\t${spec}` for TypeScript outside the mapped folders

/** The project files a specifier names, the way Metro and the tests find them. */
function resolveSpec(from, spec) {
  if (spec == null) return [];
  let base;
  if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else if (spec.startsWith('@/assets/')) base = `assets/${spec.slice('@/assets/'.length)}`;
  else if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
  else return []; // a package, node:, npm:, jsr: or a URL
  if (CODE_EXT.some((e) => base.endsWith(e))) {
    if (fileSet.has(base)) return [base];
  }
  const ext = path.posix.extname(base);
  if (ext && !CODE_EXT.includes(ext) && fs.existsSync(path.join(ROOT, base))) {
    const list = notCode.get(base) ?? [];
    list.push(from);
    notCode.set(base, list);
    return [];
  }
  for (const b of [base, `${base}/index`]) {
    const found = [];
    for (const e of CODE_EXT) {
      if (fileSet.has(b + e)) found.push(b + e);
      for (const p of PLATFORMS) if (fileSet.has(`${b}.${p}${e}`)) found.push(`${b}.${p}${e}`);
    }
    if (found.length) return found.sort(cmp);
  }
  // A TypeScript file outside src/ and supabase/functions/ (the test stand-ins in test/stubs/).
  if ([base, `${base}/index`].some((b) => CODE_EXT.some((e) => fs.existsSync(path.join(ROOT, b + e))))) {
    outside.add(`${from}\t${spec}`);
    return [];
  }
  unresolvedSpecs.set(`${from}\t${spec}`, true);
  return [];
}

for (const info of parsed.values()) {
  for (const i of info.imports) i.targets = resolveSpec(info.file, i.spec);
  for (const r of info.reexports) r.targets = resolveSpec(info.file, r.spec);
  for (const s of info.stars) s.targets = resolveSpec(info.file, s.spec);
}

const unresolvedNames = new Map(); // `${file}\t${name}` -> importers

/**
 * The files (and names there) that really define `name` as exported by `file`,
 * following `export { a as b } from`, `export *`, and `export { x }` of an
 * imported binding. '*' stands for the module object of a namespace import.
 */
function definers(file, name, seen = new Set()) {
  const key = `${file}\t${name}`;
  if (seen.has(key)) return [];
  seen.add(key);
  if (name === '*') return [{ file, name: '*' }];
  const info = parsed.get(file);
  if (!info) return [];
  if (info.exports.has(name)) return [{ file, name }];
  const out = [];
  for (const a of info.aliases.filter((x) => x.name === name)) {
    const imp = info.imports.find((i) => i.ns === a.local || i.names.some((n) => n.local === a.local));
    if (imp) {
      const imported = imp.ns === a.local ? '*' : imp.names.find((n) => n.local === a.local).imported;
      for (const t of imp.targets) out.push(...definers(t, imported, seen));
    } else if (info.decls.has(a.local)) out.push({ file, name });
  }
  for (const r of info.reexports.filter((x) => x.name === name)) for (const t of r.targets) out.push(...definers(t, r.imported, seen));
  if (!out.length && name !== 'default') for (const s of info.stars) for (const t of s.targets) out.push(...definers(t, name, seen));
  return out;
}
const defKey = (d) => `${d.file}\t${d.name}`;

// ---------------------------------------------------------------- the graph

const exportRows = [];
for (const info of parsed.values()) {
  const rows = [];
  for (const [name, e] of info.exports) rows.push([info.file, name, e.kind]);
  for (const a of info.aliases) {
    const d = info.decls.get(a.local);
    const fromImport = info.imports.some((i) => i.ns === a.local || i.names.some((n) => n.local === a.local));
    if (d && !fromImport) {
      const kind = a.name === 'default' ? 'default' : d.kind;
      rows.push([info.file, a.name, kind]);
    } else {
      const defs = uniqSorted(definers(info.file, a.name).map((x) => `${x.file}:${x.name}`));
      rows.push([info.file, a.name, 're-export', defs.join(' ') || '?']);
    }
  }
  for (const r of info.reexports) {
    const defs = uniqSorted(r.targets.flatMap((t) => definers(t, r.imported)).map((x) => `${x.file}:${x.name}`));
    rows.push([info.file, r.name, 're-export', defs.join(' ') || '?']);
  }
  for (const s of info.stars) rows.push([info.file, '*', 're-export-all', s.targets.join(' ') || clean(s.spec)]);
  exportRows.push(...rows);
}
// No line numbers: a comment or a new line above an export must not change the map.
exportRows.sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]) || cmp(a[2], b[2]) || cmp(a[3] ?? '', b[3] ?? ''));

const uses = new Map(); // defKey -> Set(importing files)
const deps = new Map(files.map((f) => [f, new Set()]));
let edgeCount = 0;
const addUse = (d, by) => {
  const k = defKey(d);
  if (!uses.has(k)) uses.set(k, new Set());
  uses.get(k).add(by);
  if (d.file !== by) deps.get(by).add(d.file);
};
for (const info of parsed.values()) {
  const dep = deps.get(info.file);
  for (const r of [...info.reexports, ...info.stars]) for (const t of r.targets) dep.add(t);
  for (const imp of info.imports) {
    for (const t of imp.targets) dep.add(t);
    if (imp.reexportOnly || imp.how === 'mock' || imp.how === 'side') continue;
    for (const t of imp.targets) {
      for (const n of imp.names) {
        const defs = definers(t, n.imported);
        if (!defs.length) {
          const k = `${t}\t${n.imported}`;
          if (!unresolvedNames.has(k)) unresolvedNames.set(k, new Set());
          unresolvedNames.get(k).add(info.file);
        }
        for (const d of defs) addUse(d, info.file);
      }
      if (imp.ns) {
        addUse({ file: t, name: '*' }, info.file);
        for (const n of imp.nsNames ?? []) for (const d of definers(t, n)) addUse(d, info.file);
      }
    }
  }
  dep.delete(info.file);
}
for (const s of deps.values()) edgeCount += s.size;

const usesRows = [...uses.entries()]
  .map(([k, set]) => {
    const [file, name] = k.split('\t');
    const by = [...set].sort(testsLast);
    return [file, name, by.length, ...by];
  })
  .sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]));
const importRows = files.map((f) => [f, ...[...deps.get(f)].sort(cmp)]);

const tsv = (rows) => rows.map((r) => r.map(clean).join('\t')).join('\n') + '\n';

// ---------------------------------------------------------------- the guide

const definitions = exportRows.filter((r) => !r[2].startsWith('re-export'));
const counts = {
  files: files.length,
  tests: files.filter(isTest).length,
  definitions: definitions.length,
  reexports: exportRows.length - definitions.length,
  used: usesRows.length,
  edges: edgeCount,
};
const kindCounts = {};
for (const r of definitions) kindCounts[r[2]] = (kindCounts[r[2]] ?? 0) + 1;
const kindLine = Object.keys(kindCounts).sort(cmp).map((k) => `${k} ${kindCounts[k]}`).join(', ');
const platformFiles = files.filter((f) => PLATFORMS.some((p) => f.includes(`.${p}.`)));

function readme() {
  return `# The code map

A graph of HealthCal's TypeScript, kept in git as plain text so that no session has to index
anything: read it with grep. It is written by \`node scripts/dev/code-map.mjs\` from the sources
alone (the TypeScript compiler's parser, syntax only), and \`src/codeMap.test.ts\` fails while
these files are not what the sources give. Do not edit them by hand.

## The files

Every file is tab-separated, one record per line, sorted, with paths relative to the repository
root.

- \`exports.tsv\`: one line per exported name. \`file  name  kind\`, sorted by file and name. There
  is no line number on purpose (an edit above an export would make the map stale): find the line
  with \`grep -n\` in the file. The kind is \`function\`,
  \`const\` (also \`let\` and \`var\`), \`class\`, \`type\`, \`interface\`, \`enum\`, \`namespace\`,
  \`component\` (a function, or a const set to an arrow function, a function expression or a call
  such as \`forwardRef(...)\`, whose name starts with a capital and has a small letter, in a .tsx
  file) or \`default\` (\`export default ...\`, name \`default\`). A name passed on from another file is
  \`re-export\` with a fourth field, the \`file:name\` that really defines it (\`?\` when nothing does),
  and \`export * from\` is one line with name \`*\`, kind \`re-export-all\` and the file it passes on.
  A name exported both as a type and as a value has a line for each.
- \`uses.tsv\`: one line per defined name that some file imports: \`file  name  count  importers...\`,
  the defining file (after following re-exports), the name, how many files import it, and those
  files, tests (\`*.test.ts\`) last. This is "who uses X". A name with no line here is imported by
  no file (an expo-router screen's \`default\` is used by the router, not by an import).
- \`imports.tsv\`: one line per file: \`file  dependencies...\`, the project files it depends on.
  Read left to right it is "what does X depend on"; grep for X anywhere but the first field and
  it is "what breaks if X changes".

## Searches

Who uses \`hasFoodLogged\` (the defining file comes first; then the count and the files):

    grep -P '\\thasFoodLogged\\t' docs/code-map/uses.tsv

What \`src/app/water.tsx\` depends on, one per line:

    grep -P '^src/app/water.tsx\\t' docs/code-map/imports.tsv | tr '\\t' '\\n' | tail -n +2

What depends on \`src/lib/hydration.ts\` (directly):

    grep -P '\\tsrc/lib/hydration.ts(\\t|$)' docs/code-map/imports.tsv | cut -f1

Every exported component of the UI kit:

    grep -P '^src/ui/[^\\t]*\\t[^\\t]*\\tcomponent$' docs/code-map/exports.tsv | cut -f1,2

Where a name is defined (any file, any kind):

    grep -P '^[^\\t]*\\tuseToday\\t' docs/code-map/exports.tsv

Everything that depends on a file, through any number of files in between (screens first, each
with how many steps away it is). This one is worked out from the sources, in about 2 s:

    node scripts/dev/code-map.mjs --dependents=src/features/morning/rule.ts

## How the map reads the code

- Files: every \`.ts\` and \`.tsx\` under \`src/\` and \`supabase/functions/\` (no \`node_modules\`, no
  hidden folders). Tests are ordinary files; they are told apart by their name, \`*.test.ts\`.
- Paths: relative (\`./x\`, \`../x\`), \`@/assets/...\` (the \`assets/\` folder) and \`@/...\` (\`src/\`), as in
  tsconfig.json. A path with \`.ts\` or \`.tsx\` (the edge functions write them) is taken as written.
  Otherwise \`x.ts\`, \`x.tsx\` and the platform files \`x.android\`, \`x.ios\`, \`x.native\`, \`x.web\`
  (each \`.ts\` or \`.tsx\`), and if none exists the same for \`x/index\`.
- Platform files: each is its own file in the map. An import of the bare name (\`./adapter\`) is
  recorded as an import of every file Metro could pick for it: the plain file and each platform
  file that exists (\`adapter.ts\`, \`adapter.android.ts\`, \`adapter.ios.ts\`), and a name imported from
  it is used in each of them that defines it. An import that names a platform file itself
  (\`./capture.native\`) is that file only. The platform files now: ${platformFiles.map((f) => `\`${f}\``).join(', ')}.
- Packages (\`react\`, \`expo-router\`, \`node:fs\`, \`npm:\`, \`jsr:\`, URLs) are not in the map.
- JSON, images and every other file that is not TypeScript are not nodes: an import of one
  (\`import data from './x.json'\`) adds nothing to the map. Today ${notCode.size === 0 ? 'no source imports one' : `${notCode.size} such file${notCode.size === 1 ? ' is' : 's are'} imported`}.
- Re-exports are followed to the file that defines the name: \`export { a as b } from\`, \`export *
  from\` (never for \`default\`, as in TypeScript), and \`export { x }\` of a name the file imported. A
  use is recorded once, against the defining file and its own name, never against the index file
  in between; the index file still appears in the importer's line of \`imports.tsv\`.
- \`imports.tsv\` holds, for each file, every file its import and export statements name (index
  files included), plus the files that really define the names it takes through them. So an
  import of \`Button\` from \`@/ui\` puts both \`src/ui/index.ts\` and \`src/ui/Button.tsx\` on the line.
- Type-only imports (\`import type\`, \`import { type X }\`, \`import('./x').X\` in a type) count like
  any other: a change to the type can break the file.
- Default imports use the name \`default\` of the file they resolve to.
- Namespace imports (\`import * as W from './words'\`): the file gets a use of the name \`*\`, and
  every \`W.name\` (or \`W.Type\` in a type) read in the importing file is a use of \`name\`. A name the
  file reaches only in another way (\`W[key]\`, passing \`W\` along) is covered by the \`*\` line only.
  Local names that shadow \`W\` are not told apart.
- Side-effect imports (\`import './x'\`) and \`vi.mock\`/\`vi.doMock\`/\`vi.importActual\` with a literal
  path add a line to \`imports.tsv\` and no use. A \`require('./x')\` or \`import('./x')\` with a literal
  path is a use of \`*\`, and so are the names taken from it at once: \`const { a, b } = await
  import('./x')\`, \`(await import('./x')).a\`, and \`const m = await import('./x')\` read later as
  \`m.a\`. A module object passed along and read elsewhere is covered by the \`*\` line only, so
  before calling a name unused, look at its file's \`*\` line too. One with a computed path cannot
  be followed (${counts.computedCount} today).
- What the map does not know: calls and references inside a file (it records which names a file
  imports, not where it uses them, or whether it does), names reached through a computed path or a
  computed key, uses by expo-router (every file under \`src/app/\` is a screen), and files outside
  \`src/\` and \`supabase/functions/\` (scripts, config, and the test stand-ins in \`test/stubs/\`: an
  import of one adds nothing, ${outside.size} today).

## Counts

${counts.files} files (${counts.tests} of them tests), ${counts.definitions} exported names (${kindLine}),
${counts.reexports} re-export lines, ${counts.used} names imported somewhere, ${counts.edges} file-to-file dependencies.

## Refreshing it

After adding, removing or renaming an export, changing what a file imports, or adding, moving or
deleting a file (an edit inside a function, a comment or a reformat changes nothing here):

    node scripts/dev/code-map.mjs           # writes docs/code-map/
    node scripts/dev/code-map.mjs --check   # what the test runs: exit 1 and what differs
    node scripts/dev/code-map.mjs --stats   # the counts and the time taken
    node scripts/dev/code-map.mjs --dependents=<file>   # all that depends on a file, screens first
`;
}

let computedCount = 0;
for (const info of parsed.values()) computedCount += info.computed;
counts.computedCount = computedCount;

const outputs = {
  'exports.tsv': tsv(exportRows),
  'uses.tsv': tsv(usesRows),
  'imports.tsv': tsv(importRows),
  'README.md': readme(),
};

// ---------------------------------------------------------------- the modes

const elapsed = () => `${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(0)} ms`;

if (mode === 'dependents') {
  const target = dependentsArg.slice('--dependents='.length).replace(/^\.\//, '');
  if (!fileSet.has(target)) {
    console.error(`code-map: ${target} is not a file of the map (give a path such as src/lib/hydration.ts)`);
    process.exit(2);
  }
  const dependents = new Map(files.map((f) => [f, []]));
  for (const [f, set] of deps) for (const d of set) dependents.get(d).push(f);
  const steps = new Map([[target, 0]]);
  for (let queue = [target]; queue.length; ) {
    const next = [];
    for (const f of queue) for (const by of dependents.get(f)) if (!steps.has(by)) { steps.set(by, steps.get(f) + 1); next.push(by); }
    queue = next;
  }
  steps.delete(target);
  const group = (f) => (f.startsWith('src/app/') ? 0 : isTest(f) ? 2 : 1);
  const list = [...steps.keys()].sort((a, b) => group(a) - group(b) || steps.get(a) - steps.get(b) || cmp(a, b));
  for (const f of list) console.log(`${steps.get(f)}\t${f}`);
  const n = (g) => list.filter((f) => group(f) === g).length;
  const many = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  console.error(`${many(list.length, 'file')} depend${list.length === 1 ? 's' : ''} on ${target}: ${many(n(0), 'screen')}, ${many(n(1), 'other file')}, ${many(n(2), 'test')} (steps away, then the file).`);
  process.exit(0);
}

if (mode === 'check') {
  const problems = [];
  for (const [name, content] of Object.entries(outputs)) {
    const p = path.join(ROOT, OUT_DIR, name);
    const old = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (old === content) continue;
    if (old === null) {
      problems.push(`${OUT_DIR}/${name} is missing`);
      continue;
    }
    const was = new Set(old.split('\n'));
    const now = new Set(content.split('\n'));
    const gone = [...was].filter((l) => l && !now.has(l));
    const added = [...now].filter((l) => l && !was.has(l));
    problems.push(`${OUT_DIR}/${name} differs (${added.length} line${added.length === 1 ? '' : 's'} to add, ${gone.length} to remove)`);
    for (const l of added.slice(0, 5)) problems.push(`  + ${l.length > 160 ? `${l.slice(0, 157)}...` : l}`);
    for (const l of gone.slice(0, 5)) problems.push(`  - ${l.length > 160 ? `${l.slice(0, 157)}...` : l}`);
  }
  if (problems.length) {
    console.error(`${FIX}\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(`The code map is up to date (${counts.files} files, ${elapsed()}).`);
  process.exit(0);
}

if (mode === 'write') {
  fs.mkdirSync(path.join(ROOT, OUT_DIR), { recursive: true });
  for (const [name, content] of Object.entries(outputs)) fs.writeFileSync(path.join(ROOT, OUT_DIR, name), content);
  console.log(`Wrote ${OUT_DIR}/: ${counts.files} files, ${counts.definitions} exports, ${counts.edges} dependencies (${elapsed()}).`);
} else {
  console.log(`files            ${counts.files} (${counts.tests} tests)`);
  console.log(`exported names   ${counts.definitions} (${kindLine})`);
  console.log(`re-export lines  ${counts.reexports}`);
  console.log(`names imported   ${counts.used}`);
  console.log(`dependencies     ${counts.edges}`);
  console.log(`not TypeScript   ${notCode.size}${notCode.size ? `: ${[...notCode.keys()].sort(cmp).join(', ')}` : ''}`);
  console.log(`computed paths   ${computedCount}`);
  console.log(`outside the map  ${outside.size}${outside.size ? `: ${[...outside].sort(cmp).map((k) => k.replace('\t', ' -> ')).join(', ')}` : ''}`);
  console.log(`unresolved paths ${unresolvedSpecs.size}`);
  for (const k of [...unresolvedSpecs.keys()].sort(cmp)) console.log(`  ${k.replace('\t', ' -> ')}`);
  console.log(`unresolved names ${unresolvedNames.size}`);
  for (const k of [...unresolvedNames.keys()].sort(cmp)) console.log(`  ${k.replace('\t', ' : ')} (imported by ${[...unresolvedNames.get(k)].sort(cmp).join(', ')})`);
  console.log(`time             ${elapsed()}`);
}
