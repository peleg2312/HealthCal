/**
 * A small, namespace-aware XML reader for TCX and GPX files. React Native has
 * no DOMParser, so this builds a light element tree. It handles comments,
 * CDATA, processing instructions, a DOCTYPE, character and the five
 * predefined entity references, and namespace prefixes (elements are matched
 * by namespace URI and local name, never by prefix, because exporters choose
 * prefixes freely). It is not a validating parser.
 */

export interface XmlElement {
  /** Namespace URI ('' when none). */
  ns: string;
  /** Local name without prefix. */
  name: string;
  /** Attributes by local name (unprefixed attributes have no namespace in XML). */
  attrs: Record<string, string>;
  children: XmlElement[];
  /** Concatenated text directly inside this element, untrimmed. */
  text: string;
}

export class XmlSyntaxError extends Error {}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[body] ?? m;
  });
}

const ATTR_RE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

interface Frame {
  el: XmlElement;
  /** Prefix -> namespace URI in scope ('' is the default namespace). */
  scope: Map<string, string>;
  qname: string;
}

/** Parse XML text into its root element. Throws XmlSyntaxError when it is not well-formed enough to read. */
export function parseXml(text: string): XmlElement {
  let i = 0;
  const n = text.length;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  const rootScope = new Map<string, string>([['xml', 'http://www.w3.org/XML/1998/namespace']]);
  const stack: Frame[] = [];
  let root: XmlElement | null = null;

  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt === -1) {
      appendText(stack, text.slice(i));
      break;
    }
    if (lt > i) appendText(stack, text.slice(i, lt));
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end === -1) throw new XmlSyntaxError('Unclosed comment');
      i = end + 3;
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      if (end === -1) throw new XmlSyntaxError('Unclosed CDATA section');
      if (stack.length) stack[stack.length - 1].el.text += text.slice(lt + 9, end);
      i = end + 3;
    } else if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2);
      if (end === -1) throw new XmlSyntaxError('Unclosed processing instruction');
      i = end + 2;
    } else if (text.startsWith('<!', lt)) {
      // DOCTYPE, possibly with an internal subset in brackets.
      let j = lt + 2;
      let depth = 0;
      while (j < n) {
        const c = text[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
        j++;
      }
      i = j + 1;
    } else if (text[lt + 1] === '/') {
      const end = text.indexOf('>', lt + 2);
      if (end === -1) throw new XmlSyntaxError('Unclosed end tag');
      const qname = text.slice(lt + 2, end).trim();
      const top = stack.pop();
      if (!top || top.qname !== qname) throw new XmlSyntaxError(`Unexpected </${qname}>`);
      i = end + 1;
    } else {
      // Start tag: find its end, skipping '>' inside quoted attribute values.
      let j = lt + 1;
      let quote = '';
      while (j < n) {
        const c = text[j];
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
        j++;
      }
      if (j >= n) throw new XmlSyntaxError('Unclosed start tag');
      let body = text.slice(lt + 1, j);
      const selfClosing = body.endsWith('/');
      if (selfClosing) body = body.slice(0, -1);
      const sp = body.search(/[\s]/);
      const qname = sp === -1 ? body : body.slice(0, sp);
      if (!qname) throw new XmlSyntaxError('Empty tag name');
      const rawAttrs: [string, string][] = [];
      if (sp !== -1) {
        ATTR_RE.lastIndex = 0;
        const attrText = body.slice(sp);
        let m: RegExpExecArray | null;
        while ((m = ATTR_RE.exec(attrText))) rawAttrs.push([m[1], decodeEntities(m[3] ?? m[4] ?? '')]);
      }
      const parentScope = stack.length ? stack[stack.length - 1].scope : rootScope;
      let scope = parentScope;
      for (const [k, v] of rawAttrs) {
        if (k === 'xmlns' || k.startsWith('xmlns:')) {
          if (scope === parentScope) scope = new Map(parentScope);
          scope.set(k === 'xmlns' ? '' : k.slice(6), v);
        }
      }
      const colon = qname.indexOf(':');
      const prefix = colon === -1 ? '' : qname.slice(0, colon);
      const el: XmlElement = {
        ns: scope.get(prefix) ?? '',
        name: colon === -1 ? qname : qname.slice(colon + 1),
        attrs: {},
        children: [],
        text: '',
      };
      for (const [k, v] of rawAttrs) {
        if (k === 'xmlns' || k.startsWith('xmlns:')) continue;
        const c = k.indexOf(':');
        el.attrs[c === -1 ? k : k.slice(c + 1)] = v;
      }
      if (stack.length) stack[stack.length - 1].el.children.push(el);
      else if (!root) root = el;
      else throw new XmlSyntaxError('More than one root element');
      if (!selfClosing) stack.push({ el, scope, qname });
      i = j + 1;
    }
  }
  if (!root) throw new XmlSyntaxError('No root element');
  if (stack.length) throw new XmlSyntaxError(`Unclosed <${stack[stack.length - 1].qname}>`);
  return root;
}

function appendText(stack: Frame[], raw: string) {
  if (stack.length) stack[stack.length - 1].el.text += decodeEntities(raw);
}

// ------------------------------------------------------------- queries

/** Direct children with this local name (and namespace, when given). */
export function children(el: XmlElement | undefined, name: string, ns?: string): XmlElement[] {
  if (!el) return [];
  return el.children.filter((c) => c.name === name && (ns === undefined || c.ns === ns));
}

export function child(el: XmlElement | undefined, name: string, ns?: string): XmlElement | undefined {
  return el?.children.find((c) => c.name === name && (ns === undefined || c.ns === ns));
}

/** Follow a path of local names through first matching children. */
export function path(el: XmlElement | undefined, names: string[], ns?: string): XmlElement | undefined {
  let cur = el;
  for (const nm of names) cur = child(cur, nm, ns);
  return cur;
}

/** All descendants with this local name, in document order. */
export function descendants(el: XmlElement, name: string, ns?: string, out: XmlElement[] = []): XmlElement[] {
  for (const c of el.children) {
    if (c.name === name && (ns === undefined || c.ns === ns)) out.push(c);
    descendants(c, name, ns, out);
  }
  return out;
}

export function textOf(el: XmlElement | undefined): string | null {
  if (!el) return null;
  const t = el.text.trim();
  return t ? t : null;
}

export function numberOf(el: XmlElement | undefined): number | null {
  const t = textOf(el);
  if (t === null) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
