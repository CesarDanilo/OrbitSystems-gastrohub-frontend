import { describe, expect, it } from 'vitest';
import { importTemplateCsv, parseCsv, parsePrice, readImportFile } from '../product-import';

describe('parsePrice', () => {
  it('reads Brazilian and international formats', () => {
    expect(parsePrice('R$ 32,90')).toBe(3290);
    expect(parsePrice('32.90')).toBe(3290);
    expect(parsePrice('1.234,50')).toBe(123450);
    expect(parsePrice('1,234.50')).toBe(123450);
    expect(parsePrice('15')).toBe(1500);
    expect(parsePrice('abc')).toBeNull();
  });
});

describe('parseCsv', () => {
  it('detects the delimiter and keeps quoted delimiters and quotes', () => {
    expect(parseCsv('a;b\r\n"x; y";"diz ""oi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x; y', 'diz "oi"'],
    ]);
    expect(parseCsv('a,b\n1,"2,5"\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2,5'],
    ]);
  });
});

describe('readImportFile', () => {
  it('reads the downloadable template', () => {
    const rows = readImportFile('modelo.csv', importTemplateCsv());
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      line: 2,
      name: 'X-Bacon',
      category: 'Burgers',
      priceCents: 3290,
      imageUrl: 'https://exemplo.com/x-bacon.jpg',
      active: true,
      featured: true,
      errors: [],
    });
    expect(rows[1]).toMatchObject({ featured: false, imageUrl: null });
  });

  it('accepts column names from other systems (English, accents, spaces)', () => {
    const rows = readImportFile(
      'export.csv',
      'Product,Category,Price,Description,Image URL,Available\nCheeseburger,Burgers,"25.90",Classic,,no\n',
    );
    expect(rows[0]).toMatchObject({
      name: 'Cheeseburger',
      category: 'Burgers',
      priceCents: 2590,
      description: 'Classic',
      active: false,
    });
  });

  it('flags rows that cannot be imported and explains why', () => {
    const rows = readImportFile(
      'erros.csv',
      'nome;preco;imagem\n;10\nPizza;grátis\nSuco;8,00;foto.jpg\nÁgua;4,00\n',
    );
    expect(rows.map((r) => r.errors)).toEqual([
      ['Nome ausente'],
      ['Preço inválido'],
      ['Imagem precisa ser um link http(s)'],
      [],
    ]);
    expect(rows[3]!.category).toBe('Sem categoria');
  });

  it('reads XML with child elements or attributes', () => {
    const xml = `<?xml version="1.0"?>
      <cardapio>
        <produto><nome>X-Salada</nome><categoria>Burgers</categoria><preco>27,90</preco></produto>
        <produto nome="Batata" categoria="Porções" preco="14.90" ativo="nao" />
      </cardapio>`;
    const rows = readImportFile('cardapio.xml', xml);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'X-Salada', priceCents: 2790, category: 'Burgers' });
    expect(rows[1]).toMatchObject({ name: 'Batata', priceCents: 1490, active: false });
  });

  it('rejects broken XML', () => {
    expect(() => readImportFile('x.xml', '<cardapio><produto>')).toThrow('XML inválido.');
  });
});

describe('BOM handling', () => {
  it('starts the template with a real BOM and ignores it when reading', () => {
    const csv = importTemplateCsv();
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(parseCsv(csv)[0]![0]).toBe('nome');
  });
});
