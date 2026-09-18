import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { unzipSync } from "fflate";

const REQUIRED_SHEETS = {
  PRODUCTOS: ["PRODUCT_ID", "Nombre", "Estado"],
  SISTEMAS: ["SYSTEM_ID", "Nombre", "Unidad", "Estado", "Opcion_core"],
  MATERIALES: ["MATERIAL_ID", "Nombre", "Unidad", "Estado"],
  COMPOSICIONES: ["BOM_ID", "SYSTEM_ID", "Orden", "MATERIAL_ID", "Unidad", "Estado"],
  TERMINACIONES: ["FINISH_ID", "Categoria_core", "Nombre", "Material_3D_ID", "Estado"],
  PRECIOS: ["PRICE_ID", "Item_type", "Item_code", "Price_type", "Moneda", "Precio_unitario", "Unidad", "Estado", "Fuente"],
  REGLAS: ["RULE_ID", "Activa", "Severidad", "Path", "Mensaje"],
  VISUAL_3D: ["MAPPING_ID", "PRODUCT_ID", "Source_type", "Source_ID", "Target_type", "Target_key", "Target_value", "Estado"],
  PROVEEDORES: ["PROVIDER_ID", "Empresa", "Estado"],
  VERSIONES: ["VERSION_ID", "Valor", "Tipo", "Estado", "Fecha"],
};

const DATE_COLUMNS = {
  PRECIOS: ["Vigente_desde", "Vigente_hasta"],
  REGLAS: ["Fecha_aprobacion"],
  VERSIONES: ["Fecha"],
};

const ID_COLUMNS = {
  PRODUCTOS: "PRODUCT_ID",
  SISTEMAS: "SYSTEM_ID",
  MATERIALES: "MATERIAL_ID",
  COMPOSICIONES: "BOM_ID",
  TERMINACIONES: "FINISH_ID",
  PRECIOS: "PRICE_ID",
  REGLAS: "RULE_ID",
  VISUAL_3D: "MAPPING_ID",
  PROVEEDORES: "PROVIDER_ID",
  VERSIONES: "VERSION_ID",
};

const ENUM_COLUMNS = {
  PRODUCTOS: { Estado: ["BORRADOR", "ACTIVO", "INACTIVO"] },
  SISTEMAS: {
    Estado: ["BORRADOR", "ACTIVO", "INACTIVO"],
    Fidelidad_3D: ["EXACTA", "APROXIMADA", "PENDIENTE"],
  },
  MATERIALES: { Estado: ["BORRADOR", "APROBADO", "INACTIVO"] },
  COMPOSICIONES: { Estado: ["BORRADOR", "APROBADO", "INACTIVO"] },
  TERMINACIONES: {
    Estado: ["BORRADOR", "ACTIVO", "INACTIVO"],
    Fidelidad_3D: ["EXACTA", "APROXIMADA", "PENDIENTE"],
  },
  PRECIOS: {
    Item_type: ["PRODUCT", "SYSTEM", "MATERIAL", "FINISH"],
    Price_type: ["COSTO_COMPRA", "PRECIO_VENTA", "PRECIO_VENTA_DEMO", "DELTA_VENTA", "DELTA_VENTA_DEMO"],
    Moneda: ["USD", "ARS"],
    Estado: ["BORRADOR", "APROBADO", "DEMO", "VENCIDO"],
  },
  REGLAS: { Severidad: ["ERROR", "WARNING"] },
  VISUAL_3D: {
    Source_type: ["PRODUCT", "SYSTEM", "FINISH"],
    Target_type: ["OPTION", "MATERIAL", "MODEL"],
    Fidelidad: ["EXACTA", "APROXIMADA", "PENDIENTE"],
    Estado: ["BORRADOR", "ACTIVO", "INACTIVO"],
  },
  PROVEEDORES: { Estado: ["BORRADOR", "APROBADO", "INACTIVO"] },
  VERSIONES: {
    Tipo: ["CATALOGO", "PRECIOS", "MODELO_3D"],
    Estado: ["BORRADOR", "APROBADO", "DEMO", "VENCIDO"],
  },
};

const textDecoder = new TextDecoder("utf-8");

function usage() {
  return [
    "Uso:",
    "  npm run catalog:import -- <catalogo.xlsx> [salida.json]",
    "",
    "Si no se indica salida, se escribe data/catalog/generated/catalog.json.",
  ].join("\n");
}

function decodeXml(value = "") {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function xmlAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : null;
}

function stripXml(value) {
  return decodeXml(value.replace(/<[^>]+>/g, ""));
}

function normalizeZipPath(target) {
  const withoutLeadingSlash = target.replace(/^\//, "");
  return withoutLeadingSlash.startsWith("xl/")
    ? withoutLeadingSlash
    : path.posix.normalize(`xl/${withoutLeadingSlash}`);
}

function getZipText(files, filePath, required = true) {
  const contents = files[filePath];
  if (!contents) {
    if (required) {
      throw new Error(`El archivo XLSX no contiene ${filePath}.`);
    }
    return "";
  }
  return textDecoder.decode(contents);
}

function parseSharedStrings(xml) {
  if (!xml) return [];

  return [...xml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((match) => {
    const textParts = [...match[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)];
    return textParts.map((part) => stripXml(part[1])).join("");
  });
}

function columnIndex(cellReference) {
  const letters = cellReference.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return -1;

  return [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseCell(cellXml, attributes, sharedStrings) {
  const type = xmlAttribute(attributes, "t");
  const valueMatch = cellXml.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/);
  const rawValue = valueMatch ? stripXml(valueMatch[1]) : "";

  if (type === "inlineStr") {
    return [...cellXml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
      .map((match) => stripXml(match[1]))
      .join("");
  }
  if (type === "s") return sharedStrings[Number(rawValue)] ?? "";
  if (type === "b") return rawValue === "1";
  if (type === "str") return rawValue === "" ? null : rawValue;
  if (type === "e") throw new Error(`La planilla contiene el error de Excel ${rawValue || "desconocido"}.`);
  if (rawValue === "") return null;

  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) ? numericValue : rawValue;
}

function parseWorksheet(xml, sharedStrings) {
  const rows = new Map();
  const rowPattern = /<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g;

  for (const rowMatch of xml.matchAll(rowPattern)) {
    const rowNumber = Number(xmlAttribute(rowMatch[1], "r"));
    if (!Number.isInteger(rowNumber)) continue;

    const cells = [];
    const cellPattern = /<(?:\w+:)?c\b([^>]*)\/>|<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g;
    for (const cellMatch of rowMatch[2].matchAll(cellPattern)) {
      const attributes = cellMatch[1] ?? cellMatch[2] ?? "";
      const reference = xmlAttribute(attributes, "r");
      if (!reference) continue;
      cells[columnIndex(reference)] = parseCell(cellMatch[3] ?? "", attributes, sharedStrings);
    }
    rows.set(rowNumber, cells);
  }

  return rows;
}

function excelSerialToDate(serial) {
  const milliseconds = Math.round((serial - 25569) * 86_400_000);
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return excelSerialToDate(value);

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toISOString().slice(0, 10);
}

function worksheetToRecords(sheetName, rows) {
  const headers = rows.get(4) ?? [];
  const headerIndexes = headers
    .map((header, index) => [header, index])
    .filter(([header]) => typeof header === "string" && header.trim() !== "");

  const requiredColumns = REQUIRED_SHEETS[sheetName];
  const knownHeaders = new Set(headerIndexes.map(([header]) => header));
  for (const column of requiredColumns) {
    if (!knownHeaders.has(column)) {
      throw new Error(`${sheetName}: falta la columna obligatoria ${column}.`);
    }
  }

  const records = [];
  for (const [rowNumber, cells] of rows.entries()) {
    if (rowNumber < 5) continue;

    const record = Object.fromEntries(
      headerIndexes.map(([header, index]) => [header, cells[index] ?? null]),
    );
    const idColumn = ID_COLUMNS[sheetName];
    if (record[idColumn] === null || record[idColumn] === "") continue;

    record.__row = rowNumber;
    for (const dateColumn of DATE_COLUMNS[sheetName] ?? []) {
      record[dateColumn] = normalizeDate(record[dateColumn]);
    }
    records.push(record);
  }

  return records;
}

function readWorkbookFiles(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const workbookXml = getZipText(files, "xl/workbook.xml");
  const relationsXml = getZipText(files, "xl/_rels/workbook.xml.rels");
  const sharedStrings = parseSharedStrings(getZipText(files, "xl/sharedStrings.xml", false));

  const relations = new Map(
    [...relationsXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>(?:<\/(?:\w+:)?Relationship>)?/g)].map((match) => [
      xmlAttribute(match[1], "Id"),
      normalizeZipPath(xmlAttribute(match[1], "Target") ?? ""),
    ]),
  );

  const sheets = new Map();
  for (const match of workbookXml.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>(?:<\/(?:\w+:)?sheet>)?/g)) {
    const name = xmlAttribute(match[1], "name");
    const relationshipId = xmlAttribute(match[1], "r:id");
    const worksheetPath = relations.get(relationshipId);
    if (!name || !worksheetPath) continue;
    sheets.set(name, parseWorksheet(getZipText(files, worksheetPath), sharedStrings));
  }

  return sheets;
}

function assertRequiredValues(sheetName, records) {
  for (const record of records) {
    for (const column of REQUIRED_SHEETS[sheetName]) {
      if (record[column] === null || record[column] === "") {
        throw new Error(
          `${sheetName}!${column}, fila ${record.__row}: el valor es obligatorio. Datos leídos: ${JSON.stringify(record)}`,
        );
      }
    }
    for (const [column, allowedValues] of Object.entries(ENUM_COLUMNS[sheetName] ?? {})) {
      if (record[column] !== null && !allowedValues.includes(record[column])) {
        throw new Error(
          `${sheetName}!${column}, fila ${record.__row}: ${record[column]} no es un valor permitido.`,
        );
      }
    }
  }
}

function indexUnique(sheetName, records) {
  const idColumn = ID_COLUMNS[sheetName];
  const index = new Map();
  for (const record of records) {
    const id = String(record[idColumn]).trim();
    if (index.has(id)) {
      throw new Error(`${sheetName}: el código ${id} está duplicado (fila ${record.__row}).`);
    }
    index.set(id, record);
  }
  return index;
}

function assertReference(index, id, context) {
  if (!index.has(String(id))) {
    throw new Error(`${context}: referencia inexistente ${id}.`);
  }
}

function validateCatalog(tables) {
  const indexes = {};
  for (const [sheetName, records] of Object.entries(tables)) {
    assertRequiredValues(sheetName, records);
    indexes[sheetName] = indexUnique(sheetName, records);
  }

  for (const row of tables.COMPOSICIONES) {
    assertReference(indexes.SISTEMAS, row.SYSTEM_ID, `COMPOSICIONES fila ${row.__row}`);
    assertReference(indexes.MATERIALES, row.MATERIAL_ID, `COMPOSICIONES fila ${row.__row}`);
  }

  const priceIndexes = {
    PRODUCT: indexes.PRODUCTOS,
    SYSTEM: indexes.SISTEMAS,
    MATERIAL: indexes.MATERIALES,
    FINISH: indexes.TERMINACIONES,
  };
  for (const row of tables.PRECIOS) {
    const itemIndex = priceIndexes[row.Item_type];
    if (!itemIndex) {
      throw new Error(`PRECIOS fila ${row.__row}: Item_type inválido ${row.Item_type}.`);
    }
    assertReference(itemIndex, row.Item_code, `PRECIOS fila ${row.__row}`);
    if (typeof row.Precio_unitario !== "number" || row.Precio_unitario < 0) {
      throw new Error(`PRECIOS fila ${row.__row}: Precio_unitario debe ser un número mayor o igual que cero.`);
    }
    if (row.Proveedor_ID) {
      assertReference(indexes.PROVEEDORES, row.Proveedor_ID, `PRECIOS fila ${row.__row}`);
    }
  }

  for (const row of tables.TERMINACIONES) {
    const allowedSystems = String(row.Sistemas_permitidos ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean);
    for (const systemId of allowedSystems) {
      assertReference(indexes.SISTEMAS, systemId, `TERMINACIONES fila ${row.__row}`);
    }
  }

  const sourceIndexes = {
    PRODUCT: indexes.PRODUCTOS,
    SYSTEM: indexes.SISTEMAS,
    FINISH: indexes.TERMINACIONES,
  };
  for (const row of tables.VISUAL_3D) {
    assertReference(indexes.PRODUCTOS, row.PRODUCT_ID, `VISUAL_3D fila ${row.__row}`);
    const sourceIndex = sourceIndexes[row.Source_type];
    if (!sourceIndex) {
      throw new Error(`VISUAL_3D fila ${row.__row}: Source_type inválido ${row.Source_type}.`);
    }
    assertReference(sourceIndex, row.Source_ID, `VISUAL_3D fila ${row.__row}`);
  }

  for (const row of tables.REGLAS) {
    if (row.Activa && (!row.Aprobado_por || !row.Fecha_aprobacion)) {
      throw new Error(`REGLAS fila ${row.__row}: una regla activa requiere aprobación y fecha.`);
    }
  }

  const warnings = [];
  const missingQuantities = tables.COMPOSICIONES.filter((row) => row.Cantidad === null).length;
  if (missingQuantities) {
    warnings.push(`${missingQuantities} componentes de BOM todavía no tienen cantidad de ingeniería.`);
  }
  const approvedPurchaseCosts = tables.PRECIOS.filter(
    (row) => row.Price_type === "COSTO_COMPRA" && row.Estado === "APROBADO",
  ).length;
  if (!approvedPurchaseCosts) {
    warnings.push("No hay costos de compra aprobados; el costo técnico aún no puede calcularse.");
  }
  const demoPrices = tables.PRECIOS.filter((row) => row.Estado === "DEMO").length;
  if (demoPrices) {
    warnings.push(`${demoPrices} precios son demostrativos y no contractuales.`);
  }

  return warnings;
}

function withoutRow(record) {
  const data = { ...record };
  delete data.__row;
  return data;
}

function currentVersion(versions, type) {
  return versions
    .filter((version) => version.Tipo === type)
    .sort((left, right) => String(right.Fecha).localeCompare(String(left.Fecha)))[0] ?? null;
}

function buildCatalog(tables, inputPath, warnings) {
  const versions = tables.VERSIONES.map(withoutRow);
  const catalogVersion = currentVersion(versions, "CATALOGO");
  const priceVersion = currentVersion(versions, "PRECIOS");

  if (!catalogVersion || !priceVersion) {
    throw new Error("VERSIONES debe contener al menos una versión de CATALOGO y una de PRECIOS.");
  }

  return {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    source: {
      workbook: path.basename(inputPath),
      catalogVersion: catalogVersion.Valor,
      priceVersion: priceVersion.Valor,
    },
    products: tables.PRODUCTOS.map(withoutRow),
    systems: tables.SISTEMAS.map(withoutRow),
    materials: tables.MATERIALES.map(withoutRow),
    compositions: tables.COMPOSICIONES.map(withoutRow),
    finishes: tables.TERMINACIONES.map(withoutRow),
    prices: tables.PRECIOS.map(withoutRow),
    rules: tables.REGLAS.map(withoutRow),
    visualMappings: tables.VISUAL_3D.map(withoutRow),
    suppliers: tables.PROVEEDORES.map(withoutRow),
    versions,
    validation: {
      valid: true,
      warnings,
    },
  };
}

async function main() {
  const [, , inputArgument, outputArgument] = process.argv;
  if (!inputArgument || inputArgument === "--help" || inputArgument === "-h") {
    process.stdout.write(`${usage()}\n`);
    process.exitCode = inputArgument ? 0 : 1;
    return;
  }

  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const projectDirectory = path.resolve(scriptDirectory, "..");
  const inputPath = path.resolve(process.cwd(), inputArgument);
  const outputPath = outputArgument
    ? path.resolve(process.cwd(), outputArgument)
    : path.join(projectDirectory, "data", "catalog", "generated", "catalog.json");

  const workbookBuffer = await readFile(inputPath);
  const workbookSheets = readWorkbookFiles(workbookBuffer);
  const tables = {};
  for (const sheetName of Object.keys(REQUIRED_SHEETS)) {
    const rows = workbookSheets.get(sheetName);
    if (!rows) throw new Error(`Falta la hoja obligatoria ${sheetName}.`);
    tables[sheetName] = worksheetToRecords(sheetName, rows);
  }

  const warnings = validateCatalog(tables);
  const catalog = buildCatalog(tables, inputPath, warnings);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  process.stdout.write(
    `${JSON.stringify({
      output: outputPath,
      catalogVersion: catalog.source.catalogVersion,
      priceVersion: catalog.source.priceVersion,
      counts: {
        products: catalog.products.length,
        systems: catalog.systems.length,
        materials: catalog.materials.length,
        compositions: catalog.compositions.length,
        prices: catalog.prices.length,
      },
      warnings,
    }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`Error de catálogo: ${error.message}\n`);
  process.exitCode = 1;
});
