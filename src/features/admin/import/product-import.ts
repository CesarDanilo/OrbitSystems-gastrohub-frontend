/**
 * Product import from another system: reads CSV (recommended: every system and spreadsheet
 * exports it) or XML, maps the columns by name (Portuguese and English aliases), and validates
 * each row before anything is sent. The API still validates and applies plan limits on save.
 */

export interface ImportRow {
  line: number;
  name: string;
  category: string;
  priceCents: number | null;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
  featured: boolean;
  errors: string[];
}

export const IMPORT_COLUMNS = [
  'nome',
  'categoria',
  'preco',
  'descricao',
  'imagem_url',
  'ativo',
  'destaque',
] as const;

const ALIASES: Record<(typeof IMPORT_COLUMNS)[number], string[]> = {
  nome: ['nome', 'name', 'produto', 'product', 'item', 'titulo', 'title', 'descricao_produto'],
  categoria: ['categoria', 'category', 'grupo', 'group', 'secao', 'departamento', 'tipo'],
  preco: ['preco', 'price', 'valor', 'preco_venda', 'valor_venda', 'pv', 'preco_unitario'],
  descricao: ['descricao', 'description', 'detalhes', 'observacao', 'ingredientes', 'obs'],
  imagem_url: ['imagem_url', 'imagem', 'image', 'image_url', 'foto', 'url_imagem', 'photo'],
  ativo: ['ativo', 'active', 'disponivel', 'available', 'status', 'situacao'],
  destaque: ['destaque', 'featured', 'em_destaque'],
};

const normalizeKey = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');

function fieldFor(header: string): (typeof IMPORT_COLUMNS)[number] | null {
  const key = normalizeKey(header);
  for (const column of IMPORT_COLUMNS) if (ALIASES[column].includes(key)) return column;
  return null;
}

/** "R$ 32,90", "32.90", "1.234,50", "1,234.50", "32" → cents. */
export function parsePrice(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const value = Number(s);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  const v = normalizeKey(raw);
  if (
    ['nao', 'no', 'false', '0', 'n', 'inativo', 'inactive', 'pausado', 'indisponivel'].includes(v)
  )
    return false;
  return ['sim', 'yes', 'true', '1', 's', 'y', 'ativo', 'active', 'disponivel', 'x'].includes(v)
    ? true
    : fallback;
}

/** RFC 4180 CSV with automatic delimiter (; , or tab) and quoted fields. */
export function parseCsv(text: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', '\t', ','].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * XML: the repeating element with the most children is the product (e.g. <produtos><produto>…).
 * Fields come from child elements or attributes, with the same aliases as the CSV.
 */
export function parseXml(text: string): Record<string, string>[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML inválido.');
  const counts = new Map<string, Element[]>();
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (el.children.length === 0 && el.attributes.length === 0) continue;
    const key = `${el.parentElement?.tagName ?? ''}>${el.tagName}`;
    counts.set(key, [...(counts.get(key) ?? []), el]);
  }
  const records = [...counts.values()]
    .filter((els) => els.some((el) => fieldsOf(el).some(([k]) => fieldFor(k) === 'nome')))
    .sort((a, b) => b.length - a.length)[0];
  return (records ?? []).map((el) => Object.fromEntries(fieldsOf(el)));
}

function fieldsOf(el: Element): [string, string][] {
  return [
    ...Array.from(el.attributes).map((a) => [a.name, a.value] as [string, string]),
    ...Array.from(el.children)
      .filter((c) => c.children.length === 0)
      .map((c) => [c.tagName, c.textContent?.trim() ?? ''] as [string, string]),
  ];
}

/** Turns header + values (CSV) or records (XML) into validated rows. */
export function toImportRows(records: Record<string, string>[], firstLine = 2): ImportRow[] {
  return records.map((record, index) => {
    const mapped: Partial<Record<(typeof IMPORT_COLUMNS)[number], string>> = {};
    for (const [key, value] of Object.entries(record)) {
      const field = fieldFor(key);
      if (field && mapped[field] === undefined) mapped[field] = value.trim();
    }
    const errors: string[] = [];
    const name = mapped.nome ?? '';
    if (name.length < 2) errors.push('Nome ausente');
    else if (name.length > 80) errors.push('Nome com mais de 80 caracteres');
    const priceCents = mapped.preco ? parsePrice(mapped.preco) : null;
    if (priceCents === null) errors.push('Preço inválido');
    const category = mapped.categoria?.trim() || 'Sem categoria';
    const image = mapped.imagem_url?.trim() || null;
    if (image && !/^https?:\/\//.test(image)) errors.push('Imagem precisa ser um link http(s)');
    return {
      line: firstLine + index,
      name,
      category: category.slice(0, 60),
      priceCents,
      description: mapped.descricao?.slice(0, 500) || null,
      imageUrl: image,
      active: parseBool(mapped.ativo, true),
      featured: parseBool(mapped.destaque, false),
      errors,
    };
  });
}

/** Reads a CSV or XML file's text into validated rows. */
export function readImportFile(fileName: string, text: string): ImportRow[] {
  if (/\.xml$/i.test(fileName) || text.trimStart().startsWith('<')) {
    return toImportRows(parseXml(text), 1);
  }
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  return toImportRows(
    rows.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))),
  );
}

/** Template in the format the import reads best: semicolon CSV with a BOM (opens in Excel). */
const BOM = String.fromCharCode(0xfeff);

export function importTemplateCsv(): string {
  const lines = [
    IMPORT_COLUMNS.join(';'),
    'X-Bacon;Burgers;32,90;Blend 160g, bacon e cheddar;https://exemplo.com/x-bacon.jpg;sim;sim',
    'Batata Frita;Porções;14,90;Porção individual;;sim;não',
    'Coca-Cola lata;Bebidas;6,90;350 ml;;sim;não',
  ];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
