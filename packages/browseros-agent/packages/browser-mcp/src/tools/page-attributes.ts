/* Astro 0.2.4 QA, F-070 (UC-31): star ratings that exist only as a CSS class
   ("star-rating Four") were out of reach in Chat Mode: read and grep saw only
   text and the accessibility tree, and evaluate is not a read-only tool. */

export interface AttributeLinesOptions {
  selector?: string
  maxLines: number
}

/**
 * Page script: one line per element that carries class, id, title, alt, role,
 * itemprop, content, datetime, aria-* or data-* attributes, in document order,
 * with the element's own text after " | ".
 */
export function buildAttributeLinesExpression(
  opts: AttributeLinesOptions,
): string {
  return `${ATTRIBUTE_LINES_SCRIPT}(${JSON.stringify({
    selector: opts.selector ?? null,
    max: opts.maxLines,
  })})`
}

export const ATTRIBUTES_DESCRIPTION =
  'one line per element with its class, id, title, alt, role, aria-* and data-* attributes and its own text, for data held only in attributes (star ratings drawn as icons, tooltips, data-* values)'

// Injected into the page via Runtime.evaluate; ES5 like content-markdown.
// Form values are left out: an input's value can be a password.
const ATTRIBUTE_LINES_SCRIPT = `(function(o) {
var SKIP = {SCRIPT:1,STYLE:1,NOSCRIPT:1,TEMPLATE:1,HEAD:1,LINK:1,META:1};
var KEEP = {'class':1,id:1,title:1,alt:1,role:1,itemprop:1,content:1,datetime:1};
var root = o.selector ? document.querySelector(o.selector) : document.body;
if (!root) return '';
var out = [];
var cut = false;

function keep(name) {
  if (KEEP[name]) return true;
  if (name === 'aria-hidden') return false;
  return name.indexOf('aria-') === 0 || name.indexOf('data-') === 0;
}

function clip(s, n) {
  s = String(s).replace(/\\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '...' : s;
}

function ownText(el) {
  var t = '';
  for (var i = 0; i < el.childNodes.length; i++) {
    var c = el.childNodes[i];
    if (c.nodeType === 3) t += c.textContent;
  }
  return clip(t, 100);
}

function visit(el) {
  if (out.length >= o.max) { cut = true; return; }
  var T = String(el.tagName || '').toUpperCase();
  if (!T || SKIP[T]) return;
  var parts = [];
  for (var i = 0; i < el.attributes.length; i++) {
    var a = el.attributes[i];
    if (!a.value || !keep(a.name)) continue;
    parts.push(a.name + '="' + clip(a.value, 200).replace(/"/g, "'") + '"');
  }
  if (parts.length) {
    var txt = ownText(el);
    out.push(T.toLowerCase() + ' ' + parts.join(' ') + (txt ? ' | ' + txt : ''));
  }
  if (T === 'SVG') return;
  for (var j = 0; j < el.children.length; j++) visit(el.children[j]);
}

visit(root);
if (cut) out.push('[list cut at ' + o.max + ' elements; pass a selector to narrow it]');
return out.join('\\n');
})`
