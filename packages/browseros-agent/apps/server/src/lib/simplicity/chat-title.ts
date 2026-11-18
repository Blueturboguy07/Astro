export const CHAT_TITLE_MAX = 200;

/* The stored chat title (history rail, Library, tooltips): the first
   question on one line, cut at a word. A 20,000-character question was
   stored whole as the title (Astro 0.2.4 QA, F-065). */
export const chatTitle = (query: string): string => {
  const flat = query.replace(/\s+/g, ' ').trim();
  if (flat.length <= CHAT_TITLE_MAX) return flat;
  const cut = flat.slice(0, CHAT_TITLE_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > CHAT_TITLE_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
};
