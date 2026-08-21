import type { NextConfig } from "next";

const githubPagesBasePath = "/modellwerk/visor1.0";
const isGithubPagesExport = process.env.NEXT_PUBLIC_DEPLOY_TARGET === "github-pages";

const nextConfig: NextConfig = {
  ...(isGithubPagesExport
    ? {
        output: "export" as const,
        basePath: githubPagesBasePath,
        assetPrefix: githubPagesBasePath,
        trailingSlash: true,
        images: {
          unoptimized: true,
        },
      }
    : {}),
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
