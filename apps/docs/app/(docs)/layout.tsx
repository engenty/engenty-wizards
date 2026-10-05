import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

/** The sidebar's chooser lists the sections: the folders whose meta.json says `"root": true`. */
export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
