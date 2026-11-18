/* Plain text from one line of inline markdown, for exports that are not
   markdown (CSV cells, PDF text). The CSV header kept "**Aspect**" and the
   Share PDF printed "##" and "**" as text (Astro 0.2.4 QA, F-063). A small
   regex pass, not a parser: emphasis needs a non-word character outside
   the markers, so "2*3*4" and snake_case_names stay as they are. */
export const stripInlineMarkdown = (text: string): string =>
  text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
    .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w_])_(?=\S)([^_]*?\S)_(?![\w_])/g, '$1$2')
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
