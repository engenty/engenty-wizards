import { getLLMText, source } from "@/lib/source";

export const revalidate = false;

/** Every page in one text file. */
export async function GET() {
  const pages = await Promise.all(source.getPages().map(getLLMText));
  return new Response(pages.join("\n\n"));
}
