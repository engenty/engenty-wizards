import { notFound } from "next/navigation";
import { getLLMText, source } from "@/lib/source";

export const revalidate = false;

/** One page as Markdown: its address with `.mdx` (the rewrite in next.config.mjs). */
export async function GET(_req: Request, { params }: RouteContext<"/llms.mdx/[[...slug]]">) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  return new Response(await getLLMText(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  return source.generateParams();
}
