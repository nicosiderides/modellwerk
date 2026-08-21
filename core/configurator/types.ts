export type ConfigurationSelection = {
  schemaVersion: 1;
  productId: string;
  quantity: number;
  options: Record<string, string>;
  materials: Record<string, string>;
};

export type CatalogProduct = {
  id: string;
  name: string;
  available: boolean;
  basePrice: number | null;
  priceOnRequest?: boolean;
};

export type CatalogChoice = {
  id: string;
  label: string;
  price: number | null;
  available?: boolean;
  availableForProducts?: string[];
  unavailableForProducts?: string[];
};

export type CatalogGroup = {
  key: string;
  label: string;
  required?: boolean;
  choices: CatalogChoice[];
};

export type RuleOperator = "equals" | "not-equals" | "in" | "not-in";

export type RuleCondition = {
  source: "product" | "option" | "material";
  key?: string;
  operator: RuleOperator;
  value: string | string[];
};

export type ConfigurationRule = {
  id: string;
  when: RuleCondition[];
  severity: "error" | "warning";
  path: string;
  message: string;
};

export type ConfigurationCatalog = {
  schemaVersion: 1;
  catalogVersion: string;
  priceBookVersion: string;
  currency: string;
  products: CatalogProduct[];
  optionGroups: CatalogGroup[];
  materialGroups: CatalogGroup[];
  rules?: ConfigurationRule[];
};

export type ValidationIssue = {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
};

export type ResolvedChoice = {
  group: CatalogGroup;
  choice: CatalogChoice;
};

export type ResolvedConfiguration = {
  product: CatalogProduct | null;
  options: ResolvedChoice[];
  materials: ResolvedChoice[];
};

export type QuoteLine = {
  id: string;
  kind: "product" | "option" | "material";
  groupKey?: string;
  label: string;
  unitAmount: number | null;
  quantity: number;
  totalAmount: number | null;
};

export type ConfigurationQuote = {
  status: "estimated" | "on-request" | "invalid";
  currency: string;
  catalogVersion: string;
  priceBookVersion: string;
  quantity: number;
  unitSubtotal: number | null;
  total: number | null;
  lines: QuoteLine[];
};

export type ConfigurationEvaluation = {
  configuration: ConfigurationSelection;
  valid: boolean;
  issues: ValidationIssue[];
  resolved: ResolvedConfiguration;
  quote: ConfigurationQuote;
};
