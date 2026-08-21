import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "@next/next/no-img-element": "off",
      "react-hooks/immutability": "off",
      "react-hooks/use-memo": "off"
    }
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    "public/**",
    "assets/**",
    "visor/**",
    "visor1.0/**",
    "build/**",
    "tools/**",
    "descargas/**",
    "Copia de seg/**"
  ])
]);
