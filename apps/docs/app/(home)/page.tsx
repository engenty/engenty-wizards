import type { Folder, Node } from "fumadocs-core/page-tree";
import { Card, Cards } from "fumadocs-ui/components/card";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

/** The sections: the folders of docs/content whose meta.json says `"root": true`. */
function sections(): Folder[] {
  const isSection = (node: Node): node is Folder => node.type === "folder" && node.root === true;
  return source.getPageTree().children.filter(isSection);
}

export default function HomePage() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
        <div>
          <h1 className="font-semibold text-4xl tracking-tight">engenty wizards docs</h1>
          <p className="mt-3 text-fd-muted-foreground text-lg">
            Describe what you do again and again, and get a wizard for it: pages that ask, AI steps
            that do the work, a link to share. These pages show how to use it and how to extend it.
          </p>
        </div>
        <Cards>
          {sections().map((section) => (
            <Card
              key={section.$id}
              href={section.index?.url ?? "/"}
              icon={section.icon}
              title={section.name}
              description={section.description}
            />
          ))}
        </Cards>
      </main>
    </HomeLayout>
  );
}
