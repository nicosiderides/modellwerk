import { ridgeHeight, slopeDegrees } from "./configuration.ts";
import { calculateMetrics, formatNumber } from "./metrics.ts";
import type { WarehouseConfig, WarehouseDefinition } from "./types.ts";

/**
 * TechnicalDescriptionEngine — memoria descriptiva dinámica.
 * Los textos viven en JSON (specs.json + memoryText de cada opción).
 * Este módulo sólo arma los tokens y aplica las plantillas.
 */

const n = (value: number) => formatNumber(value, Number.isInteger(value) ? 0 : 1);

function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export function descriptionTokens(config: WarehouseConfig, definition: WarehouseDefinition): Record<string, string> {
  const d = config.dimensions;
  const m = calculateMetrics(config, definition);
  const find = <T extends { id: string }>(list: T[], id: string) => list.find((item) => item.id === id);
  const system = find(definition.structure.systems, config.structure);
  const finish = find(definition.structure.finishes, config.structureFinish);
  const roof = find(definition.envelope.roof, config.envelope.roof);
  const walls = find(definition.envelope.walls, config.envelope.walls);
  const insulation = find(definition.envelope.insulation, config.envelope.insulation);
  const roofColor = find(definition.envelope.colors, config.envelope.roofColor);
  const wallColor = find(definition.envelope.colors, config.envelope.wallColor);
  const specs = definition.options.openings;
  const o = config.openings;

  const openingParts: string[] = [];
  const doors = o.doorsFront + o.doorsBack + o.doorsSide;
  if (doors > 0) {
    const where: string[] = [];
    if (o.doorsFront) where.push(`${o.doorsFront} en el frente`);
    if (o.doorsBack) where.push(`${o.doorsBack} en el contrafrente`);
    if (o.doorsSide) where.push(`${o.doorsSide} en el lateral`);
    openingParts.push(`${doors} ${doors === 1 ? specs.sectionalDoor.memoryText : specs.sectionalDoor.memoryText.replace(/^portón/, "portones")} de ${n(specs.sectionalDoor.width)} × ${n(Math.min(specs.sectionalDoor.height, d.eaveHeight - 0.6))} m (${joinList(where)})`);
  }
  if (o.personDoors > 0) openingParts.push(`${o.personDoors} ${o.personDoors === 1 ? specs.personDoor.memoryText : specs.personDoor.memoryText.replace(/^puerta/, "puertas")}`);
  if (o.windowsPerSide > 0) openingParts.push(`${o.windowsPerSide * 2} ${specs.window.memoryText} distribuidas en ambos laterales`);

  const activeOptions = definition.options.options.filter((opt) => config.options[opt.id]).map((opt) => opt.name.toLowerCase());

  return {
    name: definition.name,
    width: n(d.width),
    length: n(d.length),
    area: formatNumber(m.floorArea),
    volume: formatNumber(m.internalVolume),
    eaveHeight: n(d.eaveHeight),
    ridgeHeight: n(ridgeHeight(d)),
    clearHeight: n(m.clearHeight),
    slope: n(d.roofSlope),
    slopeDeg: n(slopeDegrees(d.roofSlope)),
    bays: String(d.bayCount),
    frames: String(d.bayCount + 1),
    spacing: n(d.baySpacing),
    structure: system?.memoryText ?? "",
    finish: finish?.memoryText ?? "",
    roof: roof?.memoryText ?? "",
    walls: walls?.memoryText ?? "",
    insulation: insulation?.memoryText ?? "",
    roofColor: roofColor?.name.toLowerCase() ?? "",
    wallColor: wallColor?.name.toLowerCase() ?? "",
    openings: openingParts.length ? joinList(openingParts) : "",
    options: activeOptions.length ? joinList(activeOptions) : "",
    use: definition.use.toLowerCase(),
  };
}

/** Aplica una plantilla. Si algún token usado está vacío, el párrafo se omite. */
export function applyTemplate(template: string, tokens: Record<string, string>): string | null {
  let missing = false;
  const text = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = tokens[key];
    if (value === undefined || value === "") missing = true;
    return value ?? "";
  });
  return missing ? null : text;
}

/** generateTechnicalDescription(config) → párrafos de memoria descriptiva. */
export function generateTechnicalDescription(config: WarehouseConfig, definition: WarehouseDefinition): string[] {
  const tokens = descriptionTokens(config, definition);
  const paragraphs = definition.specs.description
    .map((template) => applyTemplate(template, tokens))
    .filter((p): p is string => Boolean(p));
  // Mayúscula inicial tras sustituir tokens que empiezan en minúscula.
  return paragraphs.map((p) => p.charAt(0).toUpperCase() + p.slice(1));
}
