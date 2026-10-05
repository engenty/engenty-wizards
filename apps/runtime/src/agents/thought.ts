/**
 * The line the studio shows under the activity while the model thinks: the latest heading of
 * its reasoning (`**Planning the table**`), else its latest finished sentence.
 */
export function thoughtLine(reasoning: string): string | null {
  const headings = [...reasoning.matchAll(/\*\*([^*\n]{3,120})\*\*/g)];
  const heading = headings.at(-1)?.[1]?.trim();
  if (heading) {
    return heading;
  }
  const sentences = reasoning
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?](?=\s|$)/g)
    ?.map((s) => s.trim())
    .filter((s) => s.length > 3);
  const last = sentences?.at(-1);
  if (!last) {
    return null;
  }
  return last.length > 140 ? `${last.slice(0, 139)}…` : last;
}
