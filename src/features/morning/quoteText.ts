/**
 * The quote's words as the page sets them: inside typographic quotation marks, so the quote reads
 * as a quote at a glance and never as the app's own voice or a heading. The stored text keeps
 * straight ASCII marks (quotes.ts, checked word for word against Wikiquote); only the marks change
 * here, never a word: an apostrophe becomes ’, a quotation inside the quote becomes ‘…’ (the
 * nested form inside “…”), and verse line breaks stay.
 */
export function quoteWords(text: string): string {
  let open = true;
  const inner = text
    .replace(/"/g, () => {
      const mark = open ? '‘' : '’';
      open = !open;
      return mark;
    })
    .replace(/'/g, '’');
  return `“${inner}”`;
}
