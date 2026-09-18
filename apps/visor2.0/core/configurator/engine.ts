import type {
  CatalogChoice,
  CatalogGroup,
  ConfigurationCatalog,
  ConfigurationEvaluation,
  ConfigurationQuote,
  ConfigurationRule,
  ConfigurationSelection,
  QuoteLine,
  ResolvedChoice,
  RuleCondition,
  ValidationIssue,
} from "./types";

function getConditionValue(condition: RuleCondition, selection: ConfigurationSelection) {
  if (condition.source === "product") return selection.productId;
  if (!condition.key) return undefined;
  return condition.source === "option"
    ? selection.options[condition.key]
    : selection.materials[condition.key];
}

function conditionMatches(condition: RuleCondition, selection: ConfigurationSelection) {
  const actual = getConditionValue(condition, selection);
  const expected = Array.isArray(condition.value) ? condition.value : [condition.value];

  if (condition.operator === "equals") return actual === expected[0];
  if (condition.operator === "not-equals") return actual !== expected[0];
  if (condition.operator === "in") return actual !== undefined && expected.includes(actual);
  return actual === undefined || !expected.includes(actual);
}

function ruleMatches(rule: ConfigurationRule, selection: ConfigurationSelection) {
  return rule.when.every((condition) => conditionMatches(condition, selection));
}

function isChoiceCompatible(choice: CatalogChoice, productId: string) {
  if (choice.available === false) return false;
  if (choice.availableForProducts && !choice.availableForProducts.includes(productId)) return false;
  if (choice.unavailableForProducts?.includes(productId)) return false;
  return true;
}

function resolveGroups(
  groups: CatalogGroup[],
  values: Record<string, string>,
  productId: string,
  scope: "options" | "materials",
  issues: ValidationIssue[]
) {
  const resolved: ResolvedChoice[] = [];
  const knownKeys = new Set(groups.map((group) => group.key));

  Object.keys(values).forEach((key) => {
    if (!knownKeys.has(key)) {
      issues.push({
        code: "UNKNOWN_GROUP",
        severity: "warning",
        path: `${scope}.${key}`,
        message: `La categoria ${key} no existe en el catalogo activo.`,
      });
    }
  });

  groups.forEach((group) => {
    const selectedId = values[group.key];
    if (!selectedId) {
      if (group.required !== false) {
        issues.push({
          code: "REQUIRED_SELECTION_MISSING",
          severity: "error",
          path: `${scope}.${group.key}`,
          message: `Falta seleccionar ${group.label}.`,
        });
      }
      return;
    }

    const choice = group.choices.find((item) => item.id === selectedId);
    if (!choice) {
      issues.push({
        code: "UNKNOWN_CHOICE",
        severity: "error",
        path: `${scope}.${group.key}`,
        message: `${selectedId} no es una opcion valida para ${group.label}.`,
      });
      return;
    }

    if (!isChoiceCompatible(choice, productId)) {
      issues.push({
        code: "INCOMPATIBLE_CHOICE",
        severity: "error",
        path: `${scope}.${group.key}`,
        message: `${choice.label} no esta disponible para el producto seleccionado.`,
      });
      return;
    }

    resolved.push({ group, choice });
  });

  return resolved;
}

function createQuote(
  catalog: ConfigurationCatalog,
  selection: ConfigurationSelection,
  resolved: ConfigurationEvaluation["resolved"],
  issues: ValidationIssue[]
): ConfigurationQuote {
  const quantity = Number.isInteger(selection.quantity) && selection.quantity > 0
    ? selection.quantity
    : 1;
  const lines: QuoteLine[] = [];

  if (resolved.product) {
    lines.push({
      id: resolved.product.id,
      kind: "product",
      label: resolved.product.name,
      unitAmount: resolved.product.basePrice,
      quantity,
      totalAmount:
        resolved.product.basePrice === null ? null : resolved.product.basePrice * quantity,
    });
  }

  const addChoiceLine = (resolvedChoice: ResolvedChoice, kind: "option" | "material") => {
    const { group, choice } = resolvedChoice;
    lines.push({
      id: choice.id,
      kind,
      groupKey: group.key,
      label: `${group.label}: ${choice.label}`,
      unitAmount: choice.price,
      quantity,
      totalAmount: choice.price === null ? null : choice.price * quantity,
    });
  };

  resolved.options.forEach((item) => addChoiceLine(item, "option"));
  resolved.materials.forEach((item) => addChoiceLine(item, "material"));

  const invalid = issues.some((issue) => issue.severity === "error");
  const requiresManualPrice =
    resolved.product?.priceOnRequest === true || lines.some((line) => line.unitAmount === null);
  const pricedLines = lines.filter(
    (line): line is QuoteLine & { unitAmount: number; totalAmount: number } =>
      line.unitAmount !== null && line.totalAmount !== null
  );
  const unitSubtotal = requiresManualPrice
    ? null
    : pricedLines.reduce((total, line) => total + line.unitAmount, 0);
  const total = requiresManualPrice
    ? null
    : pricedLines.reduce((sum, line) => sum + line.totalAmount, 0);

  return {
    status: invalid ? "invalid" : requiresManualPrice ? "on-request" : "estimated",
    currency: catalog.currency,
    catalogVersion: catalog.catalogVersion,
    priceBookVersion: catalog.priceBookVersion,
    quantity,
    unitSubtotal,
    total,
    lines,
  };
}

export function evaluateConfiguration(
  catalog: ConfigurationCatalog,
  configuration: ConfigurationSelection
): ConfigurationEvaluation {
  const issues: ValidationIssue[] = [];

  if (!Number.isInteger(configuration.quantity) || configuration.quantity < 1) {
    issues.push({
      code: "INVALID_QUANTITY",
      severity: "error",
      path: "quantity",
      message: "La cantidad debe ser un numero entero mayor o igual a uno.",
    });
  }

  const product = catalog.products.find((item) => item.id === configuration.productId) ?? null;
  if (!product) {
    issues.push({
      code: "UNKNOWN_PRODUCT",
      severity: "error",
      path: "productId",
      message: `El producto ${configuration.productId} no existe en el catalogo activo.`,
    });
  } else if (!product.available) {
    issues.push({
      code: "UNAVAILABLE_PRODUCT",
      severity: "error",
      path: "productId",
      message: `${product.name} no esta disponible para configurar.`,
    });
  }

  const options = resolveGroups(
    catalog.optionGroups,
    configuration.options,
    configuration.productId,
    "options",
    issues
  );
  const materials = resolveGroups(
    catalog.materialGroups,
    configuration.materials,
    configuration.productId,
    "materials",
    issues
  );

  catalog.rules?.forEach((rule) => {
    if (!ruleMatches(rule, configuration)) return;
    issues.push({
      code: `RULE_${rule.id}`,
      severity: rule.severity,
      path: rule.path,
      message: rule.message,
    });
  });

  const resolved = { product, options, materials };
  const quote = createQuote(catalog, configuration, resolved, issues);

  return {
    configuration,
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
    resolved,
    quote,
  };
}
