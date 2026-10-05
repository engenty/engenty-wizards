import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { BASE_PATH } from "@/lib/site";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  // The address the site is published at; only canonical links and link previews read it.
  metadataBase: new URL(process.env.NEXT_PUBLIC_DOCS_SITE_URL?.trim() || "http://localhost:5184"),
  title: {
    default: "engenty wizards docs",
    template: "%s · engenty wizards docs",
  },
  description:
    "How to use engenty wizards and how to extend it with plugins: install, build and share wizards, connect services, write a plugin.",
  icons: { icon: [{ url: `${BASE_PATH}/favicon.svg`, type: "image/svg+xml" }] },
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        {/* The search asks this app's own route; a fetch does not know the base path. */}
        <RootProvider search={{ options: { api: `${BASE_PATH}/api/search` } }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
