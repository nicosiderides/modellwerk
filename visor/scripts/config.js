export function norm(s) {
  return s.toLowerCase().replace(/[_\-\.]/g, ' ');
}

const T = 'assets/textures/';

// Cada entrada PBR: d=diffuse, a=ARM (AO+rough+metal), n=normal, ws=world-scale del texel (m)
export const TEX = {
  // ── Revestimiento exterior ──
  ext_madera_horiz: { d: T+'ext_madera_horiz/wood_planks_diff_1k.jpg',     a: T+'ext_madera_horiz/wood_planks_arm_1k.jpg',     n: T+'ext_madera_horiz/wood_planks_nor_gl_1k.jpg',     ws: 1.8 },
  // ws 20.0 = cada tile cubre 20.0m → ondas sinusoidales más anchas (~80-100cm cada una)
  ext_chapa_vert:   { d: T+'ext_chapa_vert/corrugated_iron_02_diff_1k.jpg', a: T+'ext_chapa_vert/corrugated_iron_02_arm_1k.jpg', n: T+'ext_chapa_vert/corrugated_iron_02_nor_gl_1k.jpg', ws: 25.0, rotate: Math.PI / 0 },

  // ── Interior ──
  int_pintura:      { d: T+'int_pintura/painted_plaster_wall_diff_1k.jpg', a: T+'int_pintura/painted_plaster_wall_arm_1k.jpg', n: T+'int_pintura/painted_plaster_wall_nor_gl_1k.jpg', ws: 1.5 },
  wood_oak:         { d: T+'wood_oak/oak_veneer_01_diff_1k.jpg',           a: T+'wood_oak/oak_veneer_01_arm_1k.jpg',           n: T+'wood_oak/oak_veneer_01_nor_gl_1k.jpg',           ws: 1.0 },

  // ── Piso (heredados del visor) ──
  piso_cemento:     { d: T+'piso_cemento/concrete_floor_worn_001_diff_2k.jpg', a: T+'piso_cemento/concrete_floor_worn_001_arm_2k.jpg', n: T+'piso_cemento/concrete_floor_worn_001_nor_dx_2k.jpg', ws: 1.5 },
  piso_madera:      { d: T+'piso_madera/wood_shutter_diff_2k.jpg',             a: T+'piso_madera/wood_shutter_arm_2k.jpg',             n: T+'piso_madera/wood_shutter_nor_dx_2k.jpg',             ws: 1.8 },
};

// IDs de las 4 paredes interiores (deben coincidir con los nombres de material
// en el GLB: MAT_MurosInt_<wallId> — ver paso Blender)
export const INT_WALLS = ['LargaSur', 'LargaNorte', 'CortaOeste', 'CortaEste'];

// Etiquetas para mostrar en el widget de paredes
export const INT_WALL_LABELS = {
  LargaSur:   'Pared larga sur',
  LargaNorte: 'Pared larga norte',
  CortaOeste: 'Pared corta oeste',
  CortaEste:  'Pared corta este',
};

export const CATS = [
  {
    key: 'EXT_REV', label: 'Revestimiento', mode: 'texture-swap',
    match: n => (n.includes('muro panel pir') || n.includes('basic wall') || n.includes('ext muro') || n.includes('ext pared') || n.includes('mw ext')) && !n.includes('cielorraso') && !n.includes('interior'),
    opts: [
      { texSet: 'ext_madera_horiz', c: '#d4a373', name: 'Madera horizontal' },
      { texSet: 'ext_chapa_vert',   c: '#1a1a1a', name: 'Chapa vertical',   rotate: 0 },
    ],
  },

  {
    key: 'INT_PARED', label: 'Pared int.', mode: 'texture-swap', multiWall: true, walls: INT_WALLS,
    // Esta categoría NO se popula por nombre de mesh — el viewer.js detecta
    // los meshes por material.name (MAT_MurosInt_<wallId>) en un handler especial.
    match: () => false,
    opts: [
      { texSet: 'int_pintura', c: '#e8e6e0', name: 'Pintura clara' },
      { texSet: 'wood_oak',    c: '#d4a574', name: 'Wall panel madera', uvScale: 0.5 },
    ],
  },

  {
    key: 'INT_CIEL', label: 'Cielorraso', mode: 'texture-swap',
    match: n => n.includes('cielorraso') || n.includes('ceiling'),
    opts: [
      { texSet: 'int_pintura', c: '#f5f5f0', name: 'Pintura blanca' },
      { texSet: 'wood_oak',    c: '#caa376', name: 'Madera listones', uvScale: 0.5 },
    ],
  },

  {
    key: 'PISO', label: 'Piso', mode: 'texture-swap',
    match: n => n.includes('floor') || n.includes('piso'),
    opts: [
      { texSet: 'piso_madera',  c: '#b89070', name: 'Madera natural', uvScale: 0.5 },
      { texSet: 'piso_cemento', c: '#888888', name: 'Microcemento' },
    ],
  },

  {
    // Mode texture-swap: la opción puede traer texSet (PBR) o no (metal/sólido).
    // metalness/roughness por opción → permite aluminio realista sin textura.
    key: 'CARP', label: 'Carpintería', mode: 'texture-swap',
    match: n => n.includes('ventana') || (n.includes('aluminio') && !n.includes('puerta')) || n.includes('alum de cero'),
    opts: [
      { c: '#222222', name: 'Aluminio negro', metalness: 0.85, roughness: 0.28 },
      { texSet: 'wood_oak', c: '#a07a4a', name: 'Madera roble', uvScale: 0.8 },
    ],
  },
];

export const catState  = {};
export const catMeshes = {};
CATS.forEach(c => { catState[c.key] = null; catMeshes[c.key] = []; });

// Estado por-pared para categorías multiWall
export const wallState = {};
CATS.filter(c => c.multiWall).forEach(c => {
  wallState[c.key] = {};
  c.walls.forEach(w => { wallState[c.key][w] = 0; });
});

export const fixedMeshes = { estructura: [], vidrio: [], eps: [], sanitario: [], led: [] };
