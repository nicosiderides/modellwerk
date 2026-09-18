# Nucleo de configuracion

Este directorio contiene la logica comercial pura del configurador. No depende de React,
Three.js, el DOM ni del render 3D.

## Contrato

El motor recibe:

- un catalogo versionado;
- una configuracion con producto, cantidad, opciones y materiales.

Y devuelve:

- la configuracion resuelta contra el catalogo;
- errores y advertencias;
- una cotizacion con lineas auditables;
- las versiones de catalogo y lista de precios que produjeron el resultado.

```ts
const evaluation = evaluateConfiguration(catalog, configuration);

evaluation.valid;
evaluation.issues;
evaluation.quote.status;
evaluation.quote.lines;
evaluation.quote.total;
```

## Limite de responsabilidades

El nucleo decide si una configuracion es valida y cuanto vale. La interfaz decide como
mostrarla y el visor 3D decide como representarla. Ambos deben consumir la misma
configuracion evaluada.

El adaptador de la aplicacion actual esta en
`components/environment/product/modellwerkConfigurator.ts`.

## Reglas

Las reglas son datos declarativos. Una regla se activa cuando todas sus condiciones se
cumplen y produce un error o una advertencia.

```ts
{
  id: "HEALTH_REQUIRES_PIR80",
  when: [
    { source: "option", key: "use", operator: "equals", value: "health" },
    { source: "option", key: "envelope", operator: "not-equals", value: "pir-80" }
  ],
  severity: "error",
  path: "options.envelope",
  message: "Salud requiere PIR 80."
}
```

No se agregaron reglas reales al catalogo Modellwerk porque primero deben validarse con
ingenieria y produccion. El fixture de pruebas muestra como funciona el mecanismo.

## Proxima migracion

Los materiales visuales todavia se consideran incluidos con costo cero para conservar la
estimacion existente. El siguiente paso es asignarles precios reales o vincularlos con las
opciones constructivas equivalentes, eliminando la duplicacion entre catalogo comercial y
catalogo visual.
