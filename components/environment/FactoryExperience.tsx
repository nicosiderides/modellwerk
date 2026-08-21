"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Footprints,
  Gauge,
  Home,
  Info,
  Layers,
  Orbit,
  Plane,
  Route,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Store,
  Unlock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DEFAULT_MODULE_MATERIALS,
  MODULE_MATERIAL_CATEGORIES,
} from "./module/moduleOptions";
import {
  DEFAULT_PRODUCT_CONFIGURATION,
  formatUsd,
  getProductOptionGroup,
  PRODUCT_MODULES,
} from "./product/productOptions";
import { calculateProductQuote } from "./product/modellwerkConfigurator";
import type {
  ProductConfiguration,
  ProductModuleId,
} from "./product/productOptions";
import {
  DEFAULT_STATION_ID,
  getStationConfig,
  getStationIndex,
  STATIONS,
} from "./stations/stationsConfig";
import { assetPath } from "./utils/assetPath";
import type {
  ModuleMaterialKey,
  ModuleMaterialSelection,
  NavigationMode,
  ProductOptionKey,
  RenderQuality,
  StationId,
} from "./utils/sceneTypes";
import { FactoryLevaPanel } from "./utils/FactoryDebug";
import ModellwerkLoader from "./ModellwerkLoader";

const FactoryCanvas = dynamic(() => import("./FactoryCanvas"), {
  ssr: false,
  loading: () => <ModellwerkLoader variant="boot" />,
});

type ModeConfig = {
  mode: NavigationMode;
  label: string;
  shortcut: string;
  Icon: LucideIcon;
};

type ProductQuote = ReturnType<typeof calculateProductQuote>;
type SheetState = "compact" | "mid";
type ConfiguratorTab = "config" | "materials" | "technical";
type ProductBom = {
  designStatus: string;
  summary: {
    meshParts: number;
    connectionAssemblies: number;
    "MW-NI6"?: number;
    "MW-NC8"?: number;
  };
  items: Array<{ sku: string; quantity: number }>;
};

const navigationModes: ModeConfig[] = [
  { mode: "orbit", label: "Órbita", shortcut: "Mouse", Icon: Orbit },
  { mode: "walk", label: "Recorrer", shortcut: "WASD", Icon: Footprints },
  { mode: "fly", label: "Volar libre", shortcut: "WASD · Q/E", Icon: Plane },
];

const qualityModes: Array<{ quality: RenderQuality; label: string; detail: string; Icon: LucideIcon }> = [
  { quality: "auto", label: "Automatica", detail: "DPR adaptativo", Icon: Sparkles },
  { quality: "performance", label: "Rendimiento", detail: "Sombras livianas", Icon: Gauge },
  { quality: "balanced", label: "Equilibrada", detail: "60 fps objetivo", Icon: Gauge },
  { quality: "high", label: "Alta", detail: "Mejor definicion", Icon: Sparkles },
  { quality: "ultra", label: "Ultra", detail: "Postproceso completo", Icon: Sparkles },
];

function isProductOptionKey(key: ProductOptionKey | "moduleId"): key is ProductOptionKey {
  return key !== "moduleId";
}

function DecisionGuide({
  title,
  tag,
  summary,
  advantages,
  tradeoffs,
  bestFor,
  compact = false,
}: {
  title: string;
  tag?: string;
  summary?: string;
  advantages?: string[];
  tradeoffs?: string[];
  bestFor?: string;
  compact?: boolean;
}) {
  if (!summary) return null;

  return (
    <article className={`decision-guide ${compact ? "compact" : ""}`}>
      <div className="decision-guide-head">
        <span>Guía de decisión</span>
        {tag && <em>{tag}</em>}
      </div>
      <h3>{title}</h3>
      <p>{summary}</p>
      <div className="decision-guide-grid">
        <div>
          <span className="guide-label"><Check aria-hidden="true" /> Ventajas</span>
          <ul>{advantages?.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div>
          <span className="guide-label"><Info aria-hidden="true" /> A considerar</span>
          <ul>{tradeoffs?.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>
      {bestFor && (
        <div className="decision-guide-best">
          <Building2 aria-hidden="true" />
          <span><strong>Ideal para</strong>{bestFor}</span>
        </div>
      )}
    </article>
  );
}

function FactoryHud({
  activeStationId,
  activeMaterial,
  feedbackMessage,
  guidedMode,
  moduleMaterials,
  mode,
  productConfiguration,
  productQuote,
  quality,
  experienceStarted,
  onStationChange,
  onActiveMaterialChange,
  onModuleMaterialChange,
  onModeChange,
  onProductModuleChange,
  onProductOptionChange,
  onQualityChange,
  onEnterFreeMode,
  onExportConfiguration,
}: {
  activeStationId: StationId;
  activeMaterial: ModuleMaterialKey;
  feedbackMessage: string | null;
  guidedMode: boolean;
  moduleMaterials: ModuleMaterialSelection;
  mode: NavigationMode;
  productConfiguration: ProductConfiguration;
  productQuote: ProductQuote;
  quality: RenderQuality;
  experienceStarted: boolean;
  onStationChange: (stationId: StationId) => void;
  onActiveMaterialChange: (key: ModuleMaterialKey) => void;
  onModuleMaterialChange: (key: ModuleMaterialKey, optionIndex: number) => void;
  onModeChange: (mode: NavigationMode) => void;
  onProductModuleChange: (moduleId: ProductModuleId) => void;
  onProductOptionChange: (key: ProductOptionKey, optionId: string) => void;
  onQualityChange: (quality: RenderQuality) => void;
  onEnterFreeMode: () => void;
  onExportConfiguration: () => void;
}) {
  const [sheetState, setSheetState] = useState<SheetState>("mid");
  const [activeTab, setActiveTab] = useState<ConfiguratorTab>("config");
  const [stationPanelCollapsed, setStationPanelCollapsed] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [loadedProductBom, setLoadedProductBom] = useState<{
    path: string;
    data: ProductBom;
  } | null>(null);
  const activeStation = getStationConfig(activeStationId);
  const activeStationIndex = getStationIndex(activeStationId);
  const progress = ((activeStationIndex + 1) / STATIONS.length) * 100;
  const stationCategories = activeStation.materialKeys
    .map((key) => MODULE_MATERIAL_CATEGORIES.find((category) => category.key === key))
    .filter(Boolean) as typeof MODULE_MATERIAL_CATEGORIES;
  const activeCategory =
    stationCategories.find((category) => category.key === activeMaterial) ??
    stationCategories[0] ??
    MODULE_MATERIAL_CATEGORIES.find((category) => category.key === activeMaterial) ??
    MODULE_MATERIAL_CATEGORIES[0];
  const activeMaterialOption =
    activeCategory.options[moduleMaterials[activeCategory.key]] ??
    activeCategory.options[0];
  const hasStationMaterialOptions = stationCategories.length > 0;
  const showModuleSelector = activeStation.productOptionKeys.includes("moduleId");
  const stationProductGroups = activeStation.productOptionKeys
    .filter(isProductOptionKey)
    .map(getProductOptionGroup)
    .filter((group): group is NonNullable<ReturnType<typeof getProductOptionGroup>> => Boolean(group));
  const dimensions = productQuote.module.dimensions;
  const activeQuality = qualityModes.find((item) => item.quality === quality) ?? qualityModes[0];
  const activeMode = navigationModes.find((item) => item.mode === mode) ?? navigationModes[0];
  const visibleTab = activeTab === "materials" && !hasStationMaterialOptions ? "config" : activeTab;
  const isOverview = activeStationId === "overview";
  const isStructure = activeStationId === "structure";
  const isFloor = activeStationId === "floor";
  const isWalls = activeStationId === "walls";
  const isRoof = activeStationId === "roof";
  const isOpenings = activeStationId === "openings";
  const isFinishes = activeStationId === "finishes";
  const useGroup = getProductOptionGroup("use");
  const openingsGroup = getProductOptionGroup("openings");
  const openingColorCategory = MODULE_MATERIAL_CATEGORIES.find((category) => category.key === "CARP");
  const selectedOpeningOption = openingsGroup?.options.find(
    (option) => option.id === productConfiguration.openings
  );
  const technicalSelections = stationProductGroups.map((group) => ({
    label: group.shortLabel,
    value: group.options.find((option) => option.id === productConfiguration[group.key])?.label ?? "A definir",
  }));
  const selectedStructureOption = getProductOptionGroup("structure")?.options.find(
    (option) => option.id === productConfiguration.structure
  );
  const productBom = loadedProductBom && loadedProductBom.path === productQuote.module.bomPath
    ? loadedProductBom.data
    : null;
  const conceptualFastenerCount =
    productBom?.items.find((item) => item.sku === "MW-HW-M16-052")?.quantity ?? 0;

  useEffect(() => {
    const bomPath = productQuote.module.bomPath;
    let cancelled = false;

    if (!bomPath) {
      return;
    }

    fetch(assetPath(bomPath))
      .then((response) => {
        if (!response.ok) throw new Error(`BOM request failed with ${response.status}`);
        return response.json() as Promise<ProductBom>;
      })
      .then((bom) => {
        if (!cancelled) setLoadedProductBom({ path: bomPath, data: bom });
      })
      .catch(() => {
        if (!cancelled) setLoadedProductBom(null);
      });

    return () => {
      cancelled = true;
    };
  }, [productQuote.module.bomPath]);
  const handleStationChange = (stationId: StationId) => {
    const nextStation = getStationConfig(stationId);
    setActiveTab(nextStation.materialKeys.length > 0 ? "materials" : "config");
    if (nextStation.materialKeys.length > 0 && sheetState === "compact") setSheetState("mid");
    onStationChange(stationId);
  };

  const handleRelativeStation = (direction: 1 | -1) => {
    const nextIndex = (activeStationIndex + direction + STATIONS.length) % STATIONS.length;
    handleStationChange(STATIONS[nextIndex].id);
  };

  const handleMaterialCategoryChange = (key: ModuleMaterialKey) => {
    onActiveMaterialChange(key);
    setActiveTab("materials");
    if (sheetState === "compact") setSheetState("mid");
  };

  return (
    <div className={`hud hud-premium ${experienceStarted ? "hud-entered" : "hud-awaiting-entry"} ${isOverview ? "hud-overview" : "hud-station"} ${isStructure ? "hud-structure" : ""} ${isFloor ? "hud-floor" : ""} ${isWalls ? "hud-walls" : ""} ${isRoof ? "hud-roof" : ""} ${isOpenings ? "hud-openings" : ""} ${isFinishes ? "hud-finishes" : ""}`}>
      <header className="hud-top">
        <div className="brand" aria-label="MODELLWERK">
          <img src={assetPath("/brand/mw-lockup-light.svg")} alt="MODELLWERK" />
          <span className="brand-subtitle">{productConfiguration.moduleId}</span>
        </div>

        <div className="header-status" aria-label="Resumen del modulo">
          <div>
            <span>Producto</span>
            <strong>{productQuote.module.name}</strong>
          </div>
          <div>
            <span>Dimensiones</span>
            <strong>
              {dimensions.length.toFixed(1)} x {dimensions.width.toFixed(1)} m
            </strong>
          </div>
          <div>
            <span>Estado</span>
            <strong>{guidedMode ? "Guiado" : "Libre"}</strong>
          </div>
          <div>
            <span>Avance</span>
            <strong>{Math.round(progress)}%</strong>
          </div>
        </div>

        <div className="header-actions">
          <div className="completion-ring" aria-label={`${Math.round(progress)} por ciento completado`}>
            <span style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}>
              <strong>{Math.round(progress)}%</strong>
            </span>
            <small>Completado</small>
          </div>
          <button className="soft-action" type="button" title="Modo libre" onClick={onEnterFreeMode}>
            <Unlock aria-hidden="true" />
            <span>Libre</span>
          </button>
          <div className="technical-menu">
            <button
              className={`icon-action ${technicalOpen ? "active" : ""}`}
              type="button"
              title="Menu tecnico"
              aria-expanded={technicalOpen}
              onClick={() => setTechnicalOpen((open) => !open)}
            >
              <Settings aria-hidden="true" />
            </button>
            {technicalOpen && (
              <div className="technical-popover" role="dialog" aria-label="Menu tecnico">
                <div className="popover-title">
                  <span>Calidad grafica</span>
                  <small>{activeQuality.detail}</small>
                </div>
                <div className="quality-menu">
                  {qualityModes.map(({ quality: value, label, detail, Icon }) => (
                    <button
                      key={value}
                      className={`quality-menu-item ${quality === value ? "active" : ""}`}
                      type="button"
                      aria-pressed={quality === value}
                      onClick={() => onQualityChange(value)}
                    >
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                      <small>{detail}</small>
                    </button>
                  ))}
                </div>
                <dl className="technical-meta">
                  <div>
                    <dt>FPS</dt>
                    <dd>Adaptativo</dd>
                  </div>
                  <div>
                    <dt>Sombras</dt>
                    <dd>{quality === "performance" ? "Livianas" : "Activas"}</dd>
                  </div>
                  <div>
                    <dt>Modo</dt>
                    <dd>{activeMode.label}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="hud-middle">
        <section className="module-summary" aria-label="Modulo seleccionado">
          <p>Serie {productQuote.module.series}</p>
          <h1>{productQuote.module.name}</h1>
          <div>
            <span>
              {dimensions.length.toFixed(2)} x {dimensions.width.toFixed(2)} m
            </span>
            <span>{productQuote.area} m2</span>
            <span>{productQuote.module.weight}</span>
          </div>
        </section>
      </div>

      <section
        className={`station-panel ${stationPanelCollapsed ? "collapsed" : ""}`}
        aria-label="Estacion activa"
      >
        <button
          className="panel-toggle"
          type="button"
          title={stationPanelCollapsed ? "Expandir panel" : "Contraer panel"}
          aria-expanded={!stationPanelCollapsed}
          onClick={() => setStationPanelCollapsed((collapsed) => !collapsed)}
        >
          {stationPanelCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </button>
        <div className="station-compact-head">
          <span>{activeStation.step}</span>
          <strong>{activeStation.shortTitle}</strong>
          <em>{Math.round(progress)}%</em>
        </div>
        {!stationPanelCollapsed && isOverview && (
          <div className="overview-intro">
            <span className="overview-eyebrow">Configurador modular / {productConfiguration.moduleId}</span>
            <h2>
              Diseñá un módulo.<br />
              <em>Preparalo para fabricar.</em>
            </h2>
            <p>
              Configurá estructura, envolvente, aberturas y terminaciones mediante un
              recorrido técnico guiado.
            </p>
            <div className="overview-journey" aria-label="Inicio del recorrido, estación 00 de 07">
              <span>00 / GENERAL</span>
              <i><b /></i>
              <em>07 ESTACIONES</em>
            </div>
            <div className="overview-intro-actions">
              <button type="button" className="primary" onClick={() => handleStationChange("structure")}>
                <span>Iniciar recorrido</span>
                <ArrowRight aria-hidden="true" />
              </button>
              <button type="button" onClick={onEnterFreeMode}>
                <Orbit aria-hidden="true" />
                <span>Explorar libremente</span>
              </button>
            </div>
            <div className="overview-specs" aria-label="Datos del modulo">
              <span>{dimensions.length.toFixed(2)} x {dimensions.width.toFixed(2)} x {dimensions.height.toFixed(2)} m</span>
              <span>{productQuote.area} m2</span>
              <span>1 modulo</span>
            </div>
          </div>
        )}
        {!stationPanelCollapsed && !isOverview && (
          <div className="station-context" key={activeStationId}>
            <div className="station-kicker">
              <Route aria-hidden="true" />
              <span>{activeStation.eyebrow}</span>
            </div>
            <div className="station-title-row">
              <span>{activeStation.step}</span>
              <h2>{activeStation.title}</h2>
            </div>
            <p>{activeStation.description}</p>
            <div className="station-zone">
              <strong>{activeStation.productionZone}</strong>
              <span>{guidedMode ? "Órbita al centro" : activeMode.label}</span>
            </div>
            <div className="station-progress" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="station-actions">
              {activeStation.actions.map((action) => (
                <span key={action}>{action}</span>
              ))}
            </div>
            <div className="station-control-row">
              <button type="button" title="Estacion anterior" onClick={() => handleRelativeStation(-1)}>
                <ArrowLeft aria-hidden="true" />
              </button>
              <button type="button" title="Vista general" onClick={() => handleStationChange("overview")}>
                <Home aria-hidden="true" />
                <span>General</span>
              </button>
              <button type="button" className="primary" title="Siguiente estacion" onClick={() => handleRelativeStation(1)}>
                <span>Siguiente</span>
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>

      <nav
        className="station-timeline"
        aria-label="Línea de producción del configurador"
        style={{ "--timeline-progress": `${progress}%` } as CSSProperties}
      >
        {STATIONS.map((station, index) => {
          const state =
            station.id === activeStationId ? "active" : index < activeStationIndex ? "complete" : "pending";
          return (
            <button
              key={station.id}
              className={`station-step ${state}`}
              type="button"
              title={`${station.step} ${station.title}: ${station.description}`}
              aria-pressed={station.id === activeStationId}
              onClick={() => handleStationChange(station.id)}
            >
              <span className="station-index">{station.step}</span>
              <span className="station-dot" aria-hidden="true">
                {state === "complete" ? <Check /> : null}
              </span>
              <strong>{station.shortTitle}</strong>
              <span className="station-tooltip" role="tooltip">{station.description}</span>
            </button>
          );
        })}
      </nav>

      <div className="hud-bottom">
        <div className="mode-bar" aria-label="Modo de navegacion">
          {navigationModes.map(({ mode: value, label, shortcut, Icon }) => (
            <button
              key={value}
              className={`mode-button ${mode === value ? "active" : ""}`}
              type="button"
              title={`${label} (${shortcut})`}
              aria-pressed={mode === value}
              onClick={() => onModeChange(value)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              <small>{shortcut}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="factory-route-legend" aria-label="Leyenda de circulaciones">
        <span className="route-agv">Ruta módulo</span>
        <span className="route-logistics">Montacargas</span>
        <span className="route-pedestrian">Peatonal</span>
      </div>

      <section
        className={`module-material-panel sheet-${sheetState}`}
        aria-label="Materiales y componentes"
      >
        <div className="drawer-handle" aria-hidden="true" />
        <div className="customizer-head">
          <div>
            <span>{isOverview ? "Configuracion inicial" : isStructure ? "Configuracion estructural" : isFloor ? "Configuracion del piso" : `Configuracion de ${activeStation.title.toLowerCase()}`}</span>
            <small>{guidedMode ? activeStation.productionZone : "Interaccion libre sobre el modulo"}</small>
          </div>
          <div className="compact-metrics" aria-label="Resumen compacto">
            <strong>{productQuote.priceOnRequest ? "A cotizar" : formatUsd(productQuote.total)}</strong>
            <span>{productQuote.leadTime}</span>
          </div>
          <div className="sheet-state-controls" aria-label="Estado del panel">
            <button
              type="button"
              title={sheetState === "compact" ? "Abrir configurador" : "Minimizar configurador"}
              aria-label={sheetState === "compact" ? "Abrir configurador" : "Minimizar configurador"}
              aria-expanded={sheetState !== "compact"}
              onClick={() => setSheetState((current) => current === "compact" ? "mid" : "compact")}
            >
              {sheetState === "compact"
                ? <ChevronUp aria-hidden="true" />
                : <ChevronDown aria-hidden="true" />}
            </button>
          </div>
        </div>

        {sheetState !== "compact" && isOverview && (
          <div className="overview-quickstart">
            <div className="quickstart-group">
              <div className="quickstart-heading">
                <span><b>01</b> Tipo de módulo</span>
                <small>Seleccioná la escala base</small>
              </div>
              <div className="quickstart-options module-options">
                {PRODUCT_MODULES.map((productModule) => {
                  const selected = productConfiguration.moduleId === productModule.id;
                  return (
                    <button
                      key={productModule.id}
                      type="button"
                      className={selected ? "active" : ""}
                      aria-pressed={selected}
                      onClick={() => onProductModuleChange(productModule.id)}
                    >
                      <span className="quickstart-card-mark" aria-hidden="true">
                        {selected ? <Check /> : <Box />}
                      </span>
                      <strong>{productModule.name}</strong>
                      <small>
                        {productModule.dimensions.length.toFixed(2)} × {productModule.dimensions.width.toFixed(2)} m
                      </small>
                      <em>{productModule.area} m²</em>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="quickstart-group">
              <div className="quickstart-heading">
                <span><b>02</b> Uso principal</span>
                <small>Define el programa</small>
              </div>
              <div className="quickstart-options use-options">
                {useGroup?.options.slice(0, 4).map((option, index) => {
                  const UseIcon = index === 0 ? Home : index === 1 ? Building2 : index === 2 ? Sparkles : Store;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={productConfiguration.use === option.id ? "active" : ""}
                      aria-pressed={productConfiguration.use === option.id}
                      onClick={() => onProductOptionChange("use", option.id)}
                    >
                      <UseIcon aria-hidden="true" />
                      <strong>{option.label}</strong>
                      <small>{option.technical}</small>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="quickstart-group presets-group">
              <div className="quickstart-heading">
                <span><b>03</b> Presets</span>
                <small>Combinaciones de inicio</small>
              </div>
              <div className="preset-options">
                {[
                  { label: "Esencial", detail: "MW40 / Oficina", module: "MW40" as const, use: "office" },
                  { label: "Profesional", detail: "MW50 / Oficina", module: "MW50" as const, use: "office" },
                  { label: "Habitat", detail: "MW50 / Vivienda", module: "MW50" as const, use: "housing" },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={
                      productConfiguration.moduleId === preset.module && productConfiguration.use === preset.use
                        ? "active"
                        : ""
                    }
                    aria-pressed={
                      productConfiguration.moduleId === preset.module && productConfiguration.use === preset.use
                    }
                    onClick={() => {
                      onProductModuleChange(preset.module);
                      onProductOptionChange("use", preset.use);
                    }}
                  >
                    <span className="preset-visual" aria-hidden="true"><Box /></span>
                    <strong>{preset.label}</strong>
                    <small>{preset.detail}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {sheetState !== "compact" && isStructure && (
          <div className="structure-drawer">
            <div className="structure-system-options">
              <span className="structure-drawer-title">Sistemas estructurales</span>
              <div>
                {getProductOptionGroup("structure")?.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={productConfiguration.structure === option.id ? "active" : ""}
                    aria-pressed={productConfiguration.structure === option.id}
                    onClick={() => onProductOptionChange("structure", option.id)}
                  >
                    <span className="structure-card-visual"><Box aria-hidden="true" /></span>
                    <strong>{option.label}</strong>
                    <small>{option.id === "standard" ? "Configuracion base" : "Mayor capacidad"}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="structure-paint-options">
              <span className="structure-drawer-title">Pintura</span>
              <div>
                {getProductOptionGroup("structureColor")?.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={productConfiguration.structureColor === option.id ? "active" : ""}
                    aria-pressed={productConfiguration.structureColor === option.id}
                    onClick={() => onProductOptionChange("structureColor", option.id)}
                  >
                    <span
                      className={`structure-paint-swatch ${option.id}`}
                      aria-hidden="true"
                    />
                    <strong>{option.label}</strong>
                    <small>
                      {option.id === "black"
                        ? "Grafito industrial"
                        : option.id === "white"
                          ? "Blanco técnico"
                          : "Metal protegido"}
                    </small>
                  </button>
                ))}
              </div>
            </div>
            <div className="structure-spec-grid">
              <div><span>Sistema</span><strong>Steel frame</strong></div>
              <div><span>Modelo</span><strong>{productConfiguration.moduleId}</strong></div>
              <div><span>Estado BIM</span><strong>Coordinado</strong></div>
              <div><span>Visualizacion</span><strong>Inspeccion activa</strong></div>
            </div>
            {selectedStructureOption && (
              <DecisionGuide
                compact
                title={selectedStructureOption.label}
                tag={selectedStructureOption.tag}
                summary={selectedStructureOption.summary}
                advantages={selectedStructureOption.advantages}
                tradeoffs={selectedStructureOption.tradeoffs}
                bestFor={selectedStructureOption.bestFor}
              />
            )}
          </div>
        )}

        {sheetState !== "compact" && isFloor && (
          <div className="floor-drawer">
            <div className="floor-option-section">
              <span className="structure-drawer-title">Paquete inferior</span>
              <div className="floor-insulation-options">
                {getProductOptionGroup("floorInsulation")?.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={productConfiguration.floorInsulation === option.id ? "active" : ""}
                    aria-pressed={productConfiguration.floorInsulation === option.id}
                    onClick={() => onProductOptionChange("floorInsulation", option.id)}
                  >
                    <Layers aria-hidden="true" />
                    <strong>{option.label}</strong>
                    <small>{option.price === 0 ? "Base" : formatUsd(option.price)}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="floor-option-section floor-finish-section">
              <span className="structure-drawer-title">Terminacion visible</span>
              <div className="floor-finish-options">
                {activeCategory.options.map((option, index) => {
                  const selected = moduleMaterials[activeCategory.key] === index;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={selected ? "active" : ""}
                      aria-pressed={selected}
                      onClick={() => onModuleMaterialChange(activeCategory.key, index)}
                    >
                      <span style={{ backgroundColor: option.color, backgroundImage: option.texture ? `url(${assetPath(option.texture)})` : undefined }} />
                      <strong>{option.name}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="floor-learning">
              {activeMaterialOption && (
                <DecisionGuide
                  compact
                  title={activeMaterialOption.name}
                  tag={activeMaterialOption.tag}
                  summary={activeMaterialOption.summary}
                  advantages={activeMaterialOption.advantages}
                  tradeoffs={activeMaterialOption.tradeoffs}
                  bestFor={activeMaterialOption.bestFor}
                />
              )}
            </div>
          </div>
        )}

        {sheetState !== "compact" && isOpenings && openingsGroup && openingColorCategory && (
          <div className="openings-drawer">
            <div className="opening-family-grid">
              {[
                { family: "aluminum" as const, step: "01", label: "Aluminio", detail: "Líneas nacionales de alta disponibilidad" },
                { family: "pvc" as const, step: "02", label: "PVC", detail: "Perfiles multicámara de alta hermeticidad" },
              ].map((system) => {
                const systemOptions = openingsGroup.options.filter((option) => option.family === system.family);
                const systemActive = selectedOpeningOption?.family === system.family;

                return (
                  <section key={system.family} className={`opening-family ${systemActive ? "active" : ""}`}>
                    <div className="opening-family-head">
                      <span>{system.step}</span>
                      <div>
                        <strong>{system.label}</strong>
                        <small>{system.detail}</small>
                      </div>
                    </div>
                    <div className="opening-family-controls">
                      <div className="opening-control-group">
                        <span>Color</span>
                        <div className="opening-color-options">
                          {openingColorCategory.options.map((option, index) => {
                            const selected = moduleMaterials.CARP === index;
                            return (
                              <button
                                key={`${system.family}-${option.id}`}
                                type="button"
                                className={selected ? "active" : ""}
                                aria-pressed={selected}
                                title={index === 0 ? "Negro" : "Blanco"}
                                onClick={() => onModuleMaterialChange("CARP", index)}
                              >
                                <i style={{ backgroundColor: option.color }} />
                                <span>{index === 0 ? "Negro" : "Blanco"}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="opening-control-group opening-line-group">
                        <span>Línea</span>
                        <div className="opening-line-options">
                          {systemOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className={productConfiguration.openings === option.id ? "active" : ""}
                              aria-pressed={productConfiguration.openings === option.id}
                              onClick={() => onProductOptionChange("openings", option.id)}
                            >
                              <strong>{option.label.replace(" + DVH", "")}</strong>
                              <small>{option.price === 0 ? "Incluido · USD 0" : formatUsd(option.price)}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
            {selectedOpeningOption && (
              <DecisionGuide
                title={selectedOpeningOption.label}
                tag={selectedOpeningOption.tag}
                summary={selectedOpeningOption.summary}
                advantages={selectedOpeningOption.advantages}
                tradeoffs={selectedOpeningOption.tradeoffs}
                bestFor={selectedOpeningOption.bestFor}
              />
            )}
          </div>
        )}

        {sheetState !== "compact" && !isOverview && !isStructure && !isFloor && !isOpenings && (
          <div className="customizer-body">
            <div className="config-summary-row">
              <div>
                <span>Precio objetivo</span>
                <strong>{productQuote.priceOnRequest ? "A cotizar" : formatUsd(productQuote.total)}</strong>
              </div>
              <div>
                <span>Plazo</span>
                <strong>{productQuote.leadTime}</strong>
              </div>
              <div>
                <span>Montaje</span>
                <strong>{productQuote.assemblyTime}</strong>
              </div>
              <button type="button" title="Exportar JSON" onClick={onExportConfiguration}>
                <Download aria-hidden="true" />
                <span>JSON</span>
              </button>
            </div>

            <div className={`configurator-tabs ${hasStationMaterialOptions ? "" : "two-tabs"}`} role="tablist" aria-label="Secciones del configurador">
              <button
                className={visibleTab === "config" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={visibleTab === "config"}
                onClick={() => setActiveTab("config")}
              >
                <SlidersHorizontal aria-hidden="true" />
                <span>Config.</span>
              </button>
              {hasStationMaterialOptions && (
                <button
                  className={visibleTab === "materials" ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={visibleTab === "materials"}
                  onClick={() => setActiveTab("materials")}
                >
                  <Layers aria-hidden="true" />
                  <span>Materiales</span>
                </button>
              )}
              <button
                className={visibleTab === "technical" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={visibleTab === "technical"}
                onClick={() => setActiveTab("technical")}
              >
                <Info aria-hidden="true" />
                <span>Tecnico</span>
              </button>
            </div>

            {visibleTab === "config" && (
              <div className="configurator-section" role="tabpanel">
                {showModuleSelector && (
                  <div className="product-module-row" aria-label="Modelo de modulo">
                    {PRODUCT_MODULES.map((productModule) => (
                      <button
                        key={productModule.id}
                        className={[
                          "product-module-card",
                          productConfiguration.moduleId === productModule.id ? "active" : "",
                          productModule.available ? "" : "concept",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        type="button"
                        aria-pressed={productConfiguration.moduleId === productModule.id}
                        onClick={() => onProductModuleChange(productModule.id)}
                      >
                        <span>{productModule.series}</span>
                        <strong>{productModule.name}</strong>
                        <em>
                          {productModule.dimensions.length.toFixed(0)} x {productModule.dimensions.width.toFixed(0)} m
                        </em>
                      </button>
                    ))}
                  </div>
                )}

                {stationProductGroups.length > 0 ? (
                  <div className="product-option-groups">
                    {stationProductGroups.map((group) => {
                      const selectedOption =
                        group.options.find((option) => productConfiguration[group.key] === option.id) ??
                        group.options[0];

                      return (
                        <div key={group.key} className="product-option-group">
                          <div>
                            <span>{group.shortLabel}</span>
                            <small>{group.description}</small>
                          </div>
                          <div className="product-option-content">
                            <div className="product-option-row">
                              {group.options.map((option) => (
                                <button
                                  key={option.id}
                                  className={`product-option-pill ${
                                    productConfiguration[group.key] === option.id ? "active" : ""
                                  }`}
                                  type="button"
                                  aria-pressed={productConfiguration[group.key] === option.id}
                                  onClick={() => onProductOptionChange(group.key, option.id)}
                                >
                                  {option.swatch && (
                                    <i className="option-color-chip" style={{ backgroundColor: option.swatch }} />
                                  )}
                                  <span>{option.label}</span>
                                  <small>{option.price === 0 ? "Incluido · USD 0" : formatUsd(option.price)}</small>
                                </button>
                              ))}
                            </div>
                            {selectedOption && (
                              <DecisionGuide
                                compact
                                title={selectedOption.label}
                                tag={selectedOption.tag}
                                summary={selectedOption.summary}
                                advantages={selectedOption.advantages}
                                tradeoffs={selectedOption.tradeoffs}
                                bestFor={selectedOption.bestFor}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : !showModuleSelector ? (
                  <div className="empty-config-state">
                    <Info aria-hidden="true" />
                    <span>Esta estacion no requiere ajustes comerciales.</span>
                  </div>
                ) : null}
              </div>
            )}

            {visibleTab === "materials" && (
              <div className="configurator-section" role="tabpanel">
                {hasStationMaterialOptions ? (
                  <>
                    <div className="material-tabs">
                      {stationCategories.map((category, index) => (
                        <button
                          key={category.key}
                          className={`material-tab ${activeMaterial === category.key ? "active" : ""}`}
                          type="button"
                          onClick={() => handleMaterialCategoryChange(category.key)}
                        >
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <strong>{category.shortLabel}</strong>
                          <em>{category.options[moduleMaterials[category.key]]?.name}</em>
                        </button>
                      ))}
                    </div>
                    <div className="material-swatches">
                      {activeCategory.options.map((option, index) => {
                        const selected = moduleMaterials[activeCategory.key] === index;
                        return (
                          <button
                            key={option.id}
                            className={`material-swatch ${selected ? "active" : ""}`}
                            type="button"
                            aria-label={`${activeCategory.label}: ${option.name}`}
                            aria-pressed={selected}
                            data-option={option.id}
                            onClick={() => onModuleMaterialChange(activeCategory.key, index)}
                            style={{
                              backgroundColor: option.color,
                              backgroundImage: option.texture ? `url(${assetPath(option.texture)})` : undefined,
                            }}
                          >
                            <span className="swatch-check" aria-hidden="true">
                              {selected ? <Check aria-hidden="true" /> : null}
                            </span>
                            <span className="swatch-copy">
                              <strong>{option.name}</strong>
                              <small>
                                {option.id.toUpperCase()} / {option.material}
                              </small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {activeMaterialOption && (
                      <DecisionGuide
                        title={activeMaterialOption.name}
                        tag={activeMaterialOption.tag}
                        summary={activeMaterialOption.summary}
                        advantages={activeMaterialOption.advantages}
                        tradeoffs={activeMaterialOption.tradeoffs}
                        bestFor={activeMaterialOption.bestFor}
                      />
                    )}
                  </>
                ) : (
                  <div className="empty-config-state">
                    <Layers aria-hidden="true" />
                    <span>La estacion actual no expone materiales directos.</span>
                  </div>
                )}
              </div>
            )}

            {visibleTab === "technical" && (
              <div className="technical-sheet" role="tabpanel">
                <div className="technical-sheet-head">
                  <div>
                    <span>Ficha de estación / {activeStation.step}</span>
                    <strong>{activeStation.title}</strong>
                  </div>
                  <em>{productBom ? "GLB + BOM" : "Coordinado"}</em>
                </div>
                <dl className="technical-spec-list">
                  <div>
                    <dt>Módulo</dt>
                    <dd>{productQuote.module.name} · {productQuote.area} m² · {productQuote.module.weight}</dd>
                  </div>
                  {productQuote.module.modelVersion && (
                    <div>
                      <dt>Activo digital</dt>
                      <dd>
                        {productQuote.module.modelVersion} · paquete {productQuote.module.visualPackage === "structure" ? "estructura" : "completo"}
                      </dd>
                    </div>
                  )}
                  {productBom && (
                    <>
                      <div>
                        <dt>Kit MW-LOCK</dt>
                        <dd>
                          {productBom.summary["MW-NI6"] ?? 0} NI6 · {productBom.summary["MW-NC8"] ?? 0} NC8 · {productBom.summary.connectionAssemblies} assemblies
                        </dd>
                      </div>
                      <div>
                        <dt>Inventario GLB</dt>
                        <dd>{productBom.summary.meshParts} piezas · {conceptualFastenerCount} bulones M16</dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt>Celda productiva</dt>
                    <dd>{activeStation.productionZone}</dd>
                  </div>
                  {technicalSelections.map((selection) => (
                    <div key={selection.label}>
                      <dt>{selection.label}</dt>
                      <dd>{selection.value}</dd>
                    </div>
                  ))}
                  {hasStationMaterialOptions && activeMaterialOption && (
                    <div>
                      <dt>Material activo</dt>
                      <dd>{activeMaterialOption.name}</dd>
                    </div>
                  )}
                </dl>
                <div className="technical-checklist">
                  <span>Secuencia de control</span>
                  <ul>
                    {activeStation.actions.map((action) => (
                      <li key={action}><Check aria-hidden="true" />{action}</li>
                    ))}
                  </ul>
                </div>
                <div className="technical-footnote">
                  <Info aria-hidden="true" />
                  <span>Valores preliminares para configuración comercial. La ingeniería de detalle valida cada encuentro.</span>
                </div>
              </div>
            )}
          </div>
        )}

        {sheetState !== "compact" && (
          <div className="configurator-apply-bar">
            <div>
              <span>Estimación inicial</span>
              <strong>{productQuote.priceOnRequest ? "A cotizar" : formatUsd(productQuote.total)}</strong>
              <small>Se actualizará según la configuración</small>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isOverview) {
                  setSheetState("compact");
                  handleStationChange("structure");
                  return;
                }
                setSheetState("compact");
                if (activeStationId !== "review") handleRelativeStation(1);
              }}
            >
              <span>{isOverview ? "Comenzar diseño" : "Aplicar seleccion"}</span>
              <Check aria-hidden="true" />
            </button>
          </div>
        )}
      </section>

      {feedbackMessage && (
        <div className="change-toast" role="status" aria-live="polite">
          <Check aria-hidden="true" />
          <span>{feedbackMessage}</span>
        </div>
      )}
    </div>
  );
}

export default function FactoryExperience() {
  const [activeStationId, setActiveStationId] = useState<StationId>(DEFAULT_STATION_ID);
  const [activeMaterial, setActiveMaterial] = useState<ModuleMaterialKey>("EXT_REV");
  const [moduleMaterials, setModuleMaterials] = useState<ModuleMaterialSelection>(
    DEFAULT_MODULE_MATERIALS
  );
  const [productConfiguration, setProductConfiguration] = useState<ProductConfiguration>(
    DEFAULT_PRODUCT_CONFIGURATION
  );
  const [mode, setMode] = useState<NavigationMode>("orbit");
  const [quality, setQuality] = useState<RenderQuality>("auto");
  const [guidedMode, setGuidedMode] = useState(true);
  const [experienceStarted, setExperienceStarted] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const productQuote = useMemo(
    () => calculateProductQuote(productConfiguration, moduleMaterials),
    [moduleMaterials, productConfiguration]
  );
  const startExperience = useCallback(() => setExperienceStarted(true), []);
  const exteriorFinishColor = getProductOptionGroup("finish")?.options.find(
    (option) => option.id === productConfiguration.finish
  )?.swatch ?? "#ffffff";
  const interiorFinishColor = getProductOptionGroup("interiorFinish")?.options.find(
    (option) => option.id === productConfiguration.interiorFinish
  )?.swatch ?? "#ffffff";

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) window.clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  const announceChange = (message: string) => {
    setFeedbackMessage(message);
    if (feedbackTimeoutRef.current) window.clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = window.setTimeout(() => setFeedbackMessage(null), 1800);
  };

  const updateModuleMaterial = (key: ModuleMaterialKey, optionIndex: number) => {
    const category = MODULE_MATERIAL_CATEGORIES.find((item) => item.key === key);
    const option = category?.options[optionIndex];
    setModuleMaterials((current) => ({ ...current, [key]: optionIndex }));
    announceChange(option ? `${option.name} aplicado` : "Material aplicado");
  };

  const updateProductModule = (moduleId: ProductModuleId) => {
    setProductConfiguration((current) => ({ ...current, moduleId }));
    announceChange(`Modulo ${moduleId} seleccionado`);
  };

  const updateProductOption = (key: ProductOptionKey, optionId: string) => {
    const group = getProductOptionGroup(key);
    const option = group?.options.find((item) => item.id === optionId);
    setProductConfiguration((current) => ({ ...current, [key]: optionId }));
    announceChange(option ? `${option.label} aplicado` : "Configuracion actualizada");
  };

  const exportConfiguration = () => {
    const payload = {
      schemaVersion: 2,
      brand: "MODELLWERK",
      generatedAt: new Date().toISOString(),
      catalogVersion: productQuote.catalogVersion,
      priceBookVersion: productQuote.priceBookVersion,
      configuration: productQuote.configuration,
      validation: productQuote.validation,
      quote: productQuote.quote,
      digitalTwin: {
        modelPath: productQuote.module.modelPath,
        manifestPath: productQuote.module.manifestPath,
        bomPath: productQuote.module.bomPath,
        modelVersion: productQuote.module.modelVersion,
        visualPackage: productQuote.module.visualPackage,
        designStatus: productQuote.module.designStatus,
      },
      legacy: {
        productConfiguration,
        moduleMaterials,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `modellwerk-${productConfiguration.moduleId.toLowerCase()}-config.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const goToStation = (stationId: StationId) => {
    const nextStation = getStationConfig(stationId);
    const firstStationMaterial = nextStation.materialKeys[0];

    if (firstStationMaterial && !nextStation.materialKeys.includes(activeMaterial)) {
      setActiveMaterial(firstStationMaterial);
    }

    setActiveStationId(stationId);
    setGuidedMode(true);
    setMode("orbit");
  };

  const enterFreeMode = () => {
    setGuidedMode(false);
    setMode("orbit");
  };

  const updateMode = (nextMode: NavigationMode) => {
    setGuidedMode(false);
    setMode(nextMode);
  };

  return (
    <main className="factory-app">
      <FactoryCanvas
        activeStationId={activeStationId}
        guidedMode={guidedMode}
        mode={mode}
        moduleDimensions={productQuote.module.dimensions}
        moduleModelPath={productQuote.module.modelPath}
        moduleMaterials={moduleMaterials}
        structureColor={productConfiguration.structureColor}
        structureVariant={productConfiguration.structure}
        exteriorFinishColor={exteriorFinishColor}
        interiorFinishColor={interiorFinishColor}
        quality={quality}
        experienceStarted={experienceStarted}
        onExperienceStart={startExperience}
        viewMode={
          activeStationId === "structure"
            ? "structure"
            : activeStationId === "floor"
              ? "structure-floor"
              : "full"
        }
      />
      <FactoryHud
        activeStationId={activeStationId}
        activeMaterial={activeMaterial}
        feedbackMessage={feedbackMessage}
        guidedMode={guidedMode}
        moduleMaterials={moduleMaterials}
        mode={mode}
        productConfiguration={productConfiguration}
        productQuote={productQuote}
        quality={quality}
        experienceStarted={experienceStarted}
        onStationChange={goToStation}
        onActiveMaterialChange={setActiveMaterial}
        onModuleMaterialChange={updateModuleMaterial}
        onModeChange={updateMode}
        onProductModuleChange={updateProductModule}
        onProductOptionChange={updateProductOption}
        onQualityChange={setQuality}
        onEnterFreeMode={enterFreeMode}
        onExportConfiguration={exportConfiguration}
      />
      <FactoryLevaPanel />
    </main>
  );
}
