export function diagnoseIFC(text: string) {
  if (
    !text.trimStart().startsWith('ISO-10303-21;') ||
    !text.includes('END-ISO-10303-21;')
  )
    throw new Error('El archivo no contiene un intercambio IFC STEP completo.');
  const schema = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i)?.[1];
  if (!schema?.startsWith('IFC'))
    throw new Error('No se reconoce un esquema IFC.');
  return {
    schema,
    entities: (text.match(/#\d+\s*=\s*IFC\w+\s*\(/gi) || []).length,
    materials: (text.match(/=\s*IFCMATERIAL\s*\(/gi) || []).length,
    warnings: [
      'Diagnóstico básico de encabezado y entidades; no certifica conformidad IFC.',
      'La geometría IFC todavía no se convierte en este piloto.',
      'Falta vincular elementos, cantidades y precios con un catálogo aprobado.',
    ],
  };
}
export function diagnoseGLB(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (
    buffer.byteLength < 20 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error('El archivo no es un GLB 2.0 válido.');
  const end = 20 + view.getUint32(12, true);
  if (end > buffer.byteLength)
    throw new Error('El archivo GLB está incompleto.');
  const json = JSON.parse(
    new TextDecoder().decode(buffer.slice(20, end)).trim(),
  );
  if (
    [...(json.buffers || []), ...(json.images || [])].some(
      (r: { uri?: string }) => r.uri && !r.uri.startsWith('data:'),
    )
  )
    throw new Error('El GLB debe ser autocontenido, sin recursos externos.');
  return {
    schema: 'glTF 2.0',
    entities: json.nodes?.length || 0,
    materials: json.materials?.length || 0,
    warnings: [
      'La geometría no certifica propiedades BIM ni cantidades de fabricación.',
      'Archivo de referencia: no modifica el catálogo ni la cotización.',
    ],
  };
}
