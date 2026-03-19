export interface EmbedQuery {
  filepath: string;
  target?: string;
  range?: string;
  params: URLSearchParams;
  raw: string;
}

const EMBED_PATTERN = /^!\[\[(?<body>.+)\]\]$/;
const INLINE_EMBED_PATTERN = /!\[\[(?<body>.+?)\]\]/g;

export function parseEmbedSyntax(input: string): EmbedQuery | null {
  const match = input.trim().match(EMBED_PATTERN);
  return match?.groups?.body ? parseEmbedBody(match.groups.body, input) : null;
}

export function extractEmbedQueries(input: string): EmbedQuery[] {
  return Array.from(input.matchAll(INLINE_EMBED_PATTERN), (match) =>
    parseEmbedBody(match.groups?.body ?? '', match[0]),
  ).filter((value): value is EmbedQuery => value !== null);
}

function parseEmbedBody(body: string, raw: string): EmbedQuery | null {
  const [pathAndTarget, rangeAndParams = ''] = body.split('|', 2);
  const [filepath, target] = pathAndTarget.split('#', 2);
  const [range, queryString = ''] = rangeAndParams.split('?', 2);

  if (!filepath?.trim()) {
    return null;
  }

  return {
    filepath: filepath.trim(),
    target: target?.trim() || undefined,
    range: range?.trim() || undefined,
    params: new URLSearchParams(queryString),
    raw,
  };
}
