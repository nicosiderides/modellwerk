"use client";

import { assetPath } from "../environment/utils/assetPath";

export function LogoAssembly({ ready }: { ready: boolean }) {
  return (
    <div
      className={`logo-assembly ${ready ? "is-ready" : ""}`}
      role="img"
      aria-label="MODELLWERK"
    >
      <div className="logo-monogram">
        <img
          className="logo-monogram-solid"
          src={assetPath("/brand/mw-isotype-light.svg?v=3")}
          alt=""
          aria-hidden="true"
        />
        <span className="logo-light-pass" aria-hidden="true" />
      </div>
      <strong className="logo-wordmark">MODELLWERK</strong>
      <span className="logo-division">MW / CONFIGURE</span>
      <span className="logo-product">VISUALIZADOR BIM INTERACTIVO</span>
    </div>
  );
}
