export const BASE = {
  "version": 1,
  "name": "Paneles de acero",
  "source": "Modelo_Costos_Pesos_Paneles_Acero (1).xlsx",
  "settings": {
    "exchange": 1535,
    "vat": 0.21,
    "iibb": 0,
    "otherTax": 0,
    "freight": 0,
    "overhead": 0,
    "contingency": 0,
    "margin": 0,
    "weightBasis": "supplier"
  },
  "panels": [
    {
      "id": "SE-PAN-CHP104",
      "name": "SE-PAN-CHP104",
      "quantity": 72
    },
    {
      "id": "SE-PAN-CHP105",
      "name": "SE-PAN-CHP105",
      "quantity": 72
    },
    {
      "id": "SE-PAN-CHP106",
      "name": "SE-PAN-CHP106",
      "quantity": 72
    }
  ],
  "materials": [
    {
      "id": "T50x40x2.5",
      "name": "Tubo rectangular 50x40x2,5",
      "type": "tube",
      "width": 50,
      "height": 40,
      "thickness": 2.5,
      "density": 7850,
      "supplierWeight": 3.3,
      "stockLength": 6,
      "quoteId": "T50x40x2.5|Marco Aurelio Sosa",
      "purchaseMode": "manual",
      "manualQuantity": 792,
      "waste": 0.0736944851146901,
      "allocation": "net"
    },
    {
      "id": "T100x100x3.2",
      "name": "Tubo cuadrado 100x100x3,2",
      "type": "tube",
      "width": 100,
      "height": 100,
      "thickness": 3.2,
      "density": 7850,
      "supplierWeight": 9.78,
      "stockLength": 6,
      "quoteId": "T100x100x3.2|Centro Acero",
      "purchaseMode": "manual",
      "manualQuantity": 72,
      "waste": 0.2072400491840029,
      "allocation": "net"
    },
    {
      "id": "CHAPA_1_8",
      "name": "Chapa lisa negra 1/8\" (3,2 mm)",
      "type": "sheet",
      "width": 1500,
      "height": 3000,
      "thickness": 3.2,
      "density": 7850,
      "supplierWeight": 25.28,
      "stockLength": 0,
      "quoteId": "CHAPA_1_8|Gerdau",
      "purchaseMode": "auto",
      "manualQuantity": 648,
      "waste": 0,
      "allocation": "units"
    }
  ],
  "quotes": [
    {
      "id": "T50x40x2.5|Marco Aurelio Sosa",
      "materialId": "T50x40x2.5",
      "supplier": "Marco Aurelio Sosa",
      "specification": "50x40x2,5 - barra 6 m",
      "currency": "USD",
      "price": 27.53,
      "eligible": true,
      "date": "2026-09-18",
      "source": "PV X 00001-00207786 - MACE S.R.L (1) (1).pdf"
    },
    {
      "id": "T50x40x2.5|Centro Acero",
      "materialId": "T50x40x2.5",
      "supplier": "Centro Acero",
      "specification": "50x40x2,0 - no cumple espesor",
      "currency": "ARS",
      "price": 36089.95,
      "eligible": false,
      "date": "2026-09-18",
      "source": "VT_PRESUPUESTOS_CENTRO_20260918124044439301032.pdf"
    },
    {
      "id": "T50x40x2.5|Gerdau",
      "materialId": "T50x40x2.5",
      "supplier": "Gerdau",
      "specification": "50x40x2,0 - no cumple espesor",
      "currency": "ARS",
      "price": 35194.6567,
      "eligible": false,
      "date": "2026-09-18",
      "source": "mace22623496 (1).pdf"
    },
    {
      "id": "T100x100x3.2|Marco Aurelio Sosa",
      "materialId": "T100x100x3.2",
      "supplier": "Marco Aurelio Sosa",
      "specification": "100x100x3,2 - barra 6 m",
      "currency": "USD",
      "price": 84.75,
      "eligible": true,
      "date": "2026-09-18",
      "source": "PV X 00001-00207786 - MACE S.R.L (1) (1).pdf"
    },
    {
      "id": "T100x100x3.2|Centro Acero",
      "materialId": "T100x100x3.2",
      "supplier": "Centro Acero",
      "specification": "100x100x3,2 - barra 6 m",
      "currency": "ARS",
      "price": 123384.6,
      "eligible": true,
      "date": "2026-09-18",
      "source": "VT_PRESUPUESTOS_CENTRO_20260918124044439301032.pdf"
    },
    {
      "id": "T100x100x3.2|Gerdau",
      "materialId": "T100x100x3.2",
      "supplier": "Gerdau",
      "specification": "100x100x3,2 - barra 6 m",
      "currency": "ARS",
      "price": 125533.28538,
      "eligible": true,
      "date": "2026-09-18",
      "source": "mace22623496 (1).pdf"
    },
    {
      "id": "CHAPA_1_8|Marco Aurelio Sosa",
      "materialId": "CHAPA_1_8",
      "supplier": "Marco Aurelio Sosa",
      "specification": "1/8\" 1500x3000",
      "currency": "USD",
      "price": 129.65,
      "eligible": true,
      "date": "2026-09-18",
      "source": "PV X 00001-00207786 - MACE S.R.L (1) (1).pdf"
    },
    {
      "id": "CHAPA_1_8|Centro Acero",
      "materialId": "CHAPA_1_8",
      "supplier": "Centro Acero",
      "specification": "1/8\" 1500x3000",
      "currency": "ARS",
      "price": 204650.18,
      "eligible": true,
      "date": "2026-09-18",
      "source": "VT_PRESUPUESTOS_CENTRO_20260918124044439301032.pdf"
    },
    {
      "id": "CHAPA_1_8|Gerdau",
      "materialId": "CHAPA_1_8",
      "supplier": "Gerdau",
      "specification": "1/8\" 1500x3000",
      "currency": "ARS",
      "price": 196244.32048,
      "eligible": true,
      "date": "2026-09-18",
      "source": "mace22623496 (1).pdf"
    }
  ],
  "pieces": [
    {
      "id": "piece-7",
      "panelId": "SE-PAN-CHP104",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 2480,
      "height": 0,
      "quantity": 2,
      "note": "Cota vertical total"
    },
    {
      "id": "piece-8",
      "panelId": "SE-PAN-CHP104",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 2380,
      "height": 0,
      "quantity": 2,
      "note": "Montantes interiores"
    },
    {
      "id": "piece-9",
      "panelId": "SE-PAN-CHP104",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 4500,
      "height": 0,
      "quantity": 2,
      "note": "Soleras superior e inferior"
    },
    {
      "id": "piece-10",
      "panelId": "SE-PAN-CHP104",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 1425,
      "height": 0,
      "quantity": 2,
      "note": "Tramos horizontales"
    },
    {
      "id": "piece-11",
      "panelId": "SE-PAN-CHP104",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 1450,
      "height": 0,
      "quantity": 1,
      "note": "Tramo horizontal"
    },
    {
      "id": "piece-12",
      "panelId": "SE-PAN-CHP104",
      "materialId": "CHAPA_1_8",
      "name": "Chapa",
      "length": 1500,
      "height": 2470,
      "quantity": 3,
      "note": "Tres paños 1500 x 2470"
    },
    {
      "id": "piece-13",
      "panelId": "SE-PAN-CHP105",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 5855,
      "height": 0,
      "quantity": 2,
      "note": "Soleras superior e inferior"
    },
    {
      "id": "piece-14",
      "panelId": "SE-PAN-CHP105",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 2480,
      "height": 0,
      "quantity": 2,
      "note": "Extremos verticales"
    },
    {
      "id": "piece-15",
      "panelId": "SE-PAN-CHP105",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 2380,
      "height": 0,
      "quantity": 3,
      "note": "Montantes interiores"
    },
    {
      "id": "piece-16",
      "panelId": "SE-PAN-CHP105",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 1280,
      "height": 0,
      "quantity": 1,
      "note": "Tramo horizontal"
    },
    {
      "id": "piece-17",
      "panelId": "SE-PAN-CHP105",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 1450,
      "height": 0,
      "quantity": 2,
      "note": "Tramos horizontales"
    },
    {
      "id": "piece-18",
      "panelId": "SE-PAN-CHP105",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 1425,
      "height": 0,
      "quantity": 1,
      "note": "Tramo horizontal"
    },
    {
      "id": "piece-19",
      "panelId": "SE-PAN-CHP105",
      "materialId": "CHAPA_1_8",
      "name": "Chapa",
      "length": 1500,
      "height": 2470,
      "quantity": 3,
      "note": "Tres paños 1500 x 2470"
    },
    {
      "id": "piece-20",
      "panelId": "SE-PAN-CHP105",
      "materialId": "CHAPA_1_8",
      "name": "Chapa",
      "length": 1355,
      "height": 2470,
      "quantity": 1,
      "note": "Un paño 1355 x 2470"
    },
    {
      "id": "piece-21",
      "panelId": "SE-PAN-CHP106",
      "materialId": "T100x100x3.2",
      "name": "Estructura",
      "length": 2485,
      "height": 0,
      "quantity": 2,
      "note": "Columnas laterales"
    },
    {
      "id": "piece-22",
      "panelId": "SE-PAN-CHP106",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 2235,
      "height": 0,
      "quantity": 2,
      "note": "Soleras superior e inferior"
    },
    {
      "id": "piece-23",
      "panelId": "SE-PAN-CHP106",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 2380,
      "height": 0,
      "quantity": 1,
      "note": "Montante central"
    },
    {
      "id": "piece-24",
      "panelId": "SE-PAN-CHP106",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 1020,
      "height": 0,
      "quantity": 1,
      "note": "Tramo horizontal"
    },
    {
      "id": "piece-25",
      "panelId": "SE-PAN-CHP106",
      "materialId": "T50x40x2.5",
      "name": "Estructura",
      "length": 1165,
      "height": 0,
      "quantity": 1,
      "note": "Tramo horizontal"
    },
    {
      "id": "piece-26",
      "panelId": "SE-PAN-CHP106",
      "materialId": "CHAPA_1_8",
      "name": "Chapa",
      "length": 1045,
      "height": 2470,
      "quantity": 1,
      "note": "Paño 1045 x 2470"
    },
    {
      "id": "piece-27",
      "panelId": "SE-PAN-CHP106",
      "materialId": "CHAPA_1_8",
      "name": "Chapa",
      "length": 1190,
      "height": 2470,
      "quantity": 1,
      "note": "Paño 1190 x 2470"
    }
  ]
};
