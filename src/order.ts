import type { Edges, KitchenModel } from './cabinets';
import { MATERIAL_KEYS } from './design';
import type { KitchenDesign, MaterialKey } from './types';

export interface CutLine {
  name: string; material: MaterialKey; materialName: string; thickness: number;
  length: number; width: number; qty: number; edges: string; finish: string; cabinets: string[];
}
export interface HardwareTotal { name: string; qty: number; cabinets: string[] }
export interface MaterialTotal { material: MaterialKey; name: string; thickness: number; panels: number; areaM2: number; edgeBandM: number }

export const edgeLabel = (edges: Edges) =>
  (['l1', 'l2', 'w1', 'w2'] as const).filter(key => edges[key]).map(key => key.toUpperCase()).join(' ') || '—';

/** Identical panels merged into one line, grouped by material, longest first. */
export function cutList(design: KitchenDesign, model: KitchenModel): CutLine[] {
  const lines = new Map<string, CutLine>();
  for (const panel of model.panels) {
    const material = design.materials[panel.material], edges = edgeLabel(panel.edges);
    const key = [panel.material, panel.name, panel.length, panel.width, edges, panel.finish].join('|');
    let line = lines.get(key);
    if (!line) {
      line = { name: panel.name, material: panel.material, materialName: material.name, thickness: material.thickness,
        length: panel.length, width: panel.width, qty: 0, edges, finish: panel.finish, cabinets: [] };
      lines.set(key, line);
    }
    line.qty++;
    if (!line.cabinets.includes(panel.cabinet)) line.cabinets.push(panel.cabinet);
  }
  return [...lines.values()].sort((a, b) =>
    MATERIAL_KEYS.indexOf(a.material) - MATERIAL_KEYS.indexOf(b.material) ||
    b.length - a.length || b.width - a.width || a.name.localeCompare(b.name));
}

export function hardwareList(model: KitchenModel): HardwareTotal[] {
  const totals = new Map<string, HardwareTotal>();
  for (const line of model.hardware) {
    const total = totals.get(line.name) ?? { name: line.name, qty: 0, cabinets: [] };
    totals.set(line.name, total);
    total.qty += line.qty;
    if (!total.cabinets.includes(line.cabinet)) total.cabinets.push(line.cabinet);
  }
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function materialTotals(design: KitchenDesign, model: KitchenModel): MaterialTotal[] {
  const totals = new Map<MaterialKey, MaterialTotal>();
  for (const panel of model.panels) {
    const material = design.materials[panel.material];
    const total = totals.get(panel.material) ??
      { material: panel.material, name: material.name, thickness: material.thickness, panels: 0, areaM2: 0, edgeBandM: 0 };
    totals.set(panel.material, total);
    const { l1, l2, w1, w2 } = panel.edges;
    total.panels++;
    total.areaM2 += panel.length * panel.width / 1e6;
    total.edgeBandM += ((+l1 + +l2) * panel.length + (+w1 + +w2) * panel.width) / 1000;
  }
  return MATERIAL_KEYS.flatMap(key => totals.get(key) ?? []);
}

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** Panels, then hardware, as one CSV for a cutting service. */
export function orderCsv(design: KitchenDesign, model: KitchenModel): string {
  const rows: (string | number)[][] = [
    ['Part', 'Cabinets', 'Material', 'Thickness (mm)', 'Length (mm)', 'Width (mm)', 'Qty', 'Edge banding', 'Finish'],
    ...cutList(design, model).map(line => [line.name, line.cabinets.join(' '), line.materialName, line.thickness,
      line.length, line.width, line.qty, line.edges, line.finish]),
    [],
    ['Hardware', 'Qty', 'Cabinets'],
    ...hardwareList(model).map(total => [total.name, total.qty, total.cabinets.join(' ')]),
  ];
  return rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
