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
          src={assetPath("/brand/mw-isotype-light.svg")}
          alt=""
          aria-hidden="true"
        />
        <span className="logo-light-pass" aria-hidden="true" />
      </div>
      <strong className="logo-wordmark">MODELLWERK</strong>
    </div>
  );
}
