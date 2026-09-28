import type { NextConfig } from "next";

const deployTarget = process.env.NEXT_PUBLIC_DEPLOY_TARGET;
const isGithubPagesExport = deployTarget === "github-pages" || deployTarget === "github-pages-assembly";
const githubPagesBasePath = deployTarget === "github-pages-assembly" ? "/modellwerk/assembly" : "/modellwerk/visor1.0";

const nextConfig: NextConfig = {
  ...(isGithubPagesExport
    ? {
        output: "export" as const,
        basePath: githubPagesBasePath,
        assetPrefix: githubPagesBasePath,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
