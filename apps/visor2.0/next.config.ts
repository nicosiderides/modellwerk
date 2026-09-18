import type { NextConfig } from "next";

const githubPagesBasePath = "/modellwerk/visor2.0";
const isGithubPagesExport = process.env.NEXT_PUBLIC_DEPLOY_TARGET === "github-pages";

const nextConfig: NextConfig = {
  output: "export",
  ...(isGithubPagesExport
    ? {
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
