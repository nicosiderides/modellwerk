const rawAssetBasePath =
  process.env.NEXT_PUBLIC_ASSET_BASE_PATH ??
  (process.env.NEXT_PUBLIC_DEPLOY_TARGET === "github-pages" ? "/modellwerk/visor1.0" : "");
const normalizedAssetBasePath = rawAssetBasePath.endsWith("/")
  ? rawAssetBasePath.slice(0, -1)
  : rawAssetBasePath;

export function assetPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedAssetBasePath}${normalizedPath}`;
}
