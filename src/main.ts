import './style.css';
import initial from '../kitchen-design.json';
import { generateKitchen, hardware, type KitchenModel } from './cabinets';
import { validateDesign } from './design';
import { cutList, hardwareList, materialTotals, orderCsv } from './order';
import type { KitchenDesign } from './types';
import { KitchenView } from './view';

declare global {
  interface Window { __kitchen?: { design: KitchenDesign; model: KitchenModel; view: KitchenView } }
}

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const esc = (value: string | number) => String(value).replace(/[&<>"]/g, ch => `&#${ch.charCodeAt(0)};`);

function showNotice(lines: string[], error = false) {
  const notice = $('#notice');
  notice.hidden = !lines.length;
  notice.classList.toggle('error', error);
  notice.innerHTML = `<ul>${lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>`;
}

/** The fixed layout from kitchen-design.json, or another file via ?design=examples/angled-island.json. */
async function loadDesign(): Promise<KitchenDesign> {
  const url = new URLSearchParams(location.search).get('design');
  if (!url) return validateDesign(initial);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  return validateDesign(await response.json());
}

function renderOrder(design: KitchenDesign, model: KitchenModel) {
  const table = (head: string[], rows: (string | number)[][], numeric: number[]) => `<table>
    <thead><tr>${head.map((h, i) => `<th${numeric.includes(i) ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${row.map((v, i) => `<td${numeric.includes(i) ? ' class="num"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
  $('#order').innerHTML = `
    <h2>Panels</h2>
    <p class="note">Finished sizes in millimetres, edge banding included. Length runs along the grain;
      L1/L2 are the edges along the length, W1/W2 along the width.</p>
    ${table(['Part', 'Cabinets', 'Material', 'Thickness', 'Length', 'Width', 'Qty', 'Edges', 'Finish'],
      cutList(design, model).map(l => [l.name, l.cabinets.join(' '), l.materialName, l.thickness, l.length, l.width, l.qty, l.edges, l.finish]),
      [3, 4, 5, 6])}
    <h2>Hardware</h2>
    <p class="note">${esc(hardware.note)}</p>
    ${table(['Item', 'Qty', 'Cabinets'], hardwareList(model).map(h => [h.name, h.qty, h.cabinets.join(' ')]), [1])}
    <h2>Materials</h2>
    ${table(['Material', 'Thickness', 'Panels', 'Area (m²)', 'Edge banding (m)'],
      materialTotals(design, model).map(t => [t.name, t.thickness, t.panels, t.areaM2.toFixed(2), t.edgeBandM.toFixed(1)]),
      [1, 2, 3, 4])}`;
}

async function start() {
  const design = await loadDesign();
  const model = generateKitchen(design);
  const view = new KitchenView($('#view'));
  view.setModel(design, model);
  renderOrder(design, model);
  showNotice(model.warnings);

  for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    tab.addEventListener('click', () => {
      for (const other of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
        other.classList.toggle('active', other === tab);
        $(`#${other.dataset.tab}`).hidden = other !== tab;
      }
    });
  }
  $('#open-all').addEventListener('click', () => view.setAll(true));
  $('#close-all').addEventListener('click', () => view.setAll(false));
  $('#download').addEventListener('click', () => {
    // The byte-order mark lets Excel read the UTF-8 text.
    const url = URL.createObjectURL(new Blob(['﻿', orderCsv(design, model)], { type: 'text/csv' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'kitchen-order.csv' });
    link.click();
    URL.revokeObjectURL(url);
  });
  window.__kitchen = { design, model, view };
}

start().catch(error => showNotice([error instanceof Error ? error.message : String(error)], true));
