import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { BASE_PATH, GITHUB_URL } from "./site";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          {/* biome-ignore lint/performance/noImgElement: a 24 px animated SVG, nothing to optimise */}
          <img src={`${BASE_PATH}/favicon.svg`} alt="" width={24} height={24} />
          <span className="font-display font-semibold tracking-tight">engenty wizards</span>
        </>
      ),
      url: "/",
    },
    githubUrl: GITHUB_URL,
  };
}
