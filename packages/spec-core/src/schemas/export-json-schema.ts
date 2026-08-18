import { zodToJsonSchema } from 'zod-to-json-schema';
import { writeFileSync, mkdirSync } from 'node:fs';
import { SpecBundleSchema } from './index';

// zod-to-json-schema'in tip tanımları `zod/v3` alt yolunu, bizim şemalar ise `zod`
// ana girişini kullanır; node10 modül çözümlemesinde bunlar ayrı deklarasyon
// zincirleridir (çalışma zamanında aynı zod v3 sınıfları). Tip düzeyinde köprü:
const SpecBundleForExport = SpecBundleSchema as unknown as Parameters<
  typeof zodToJsonSchema
>[0];

mkdirSync('generated', { recursive: true });
writeFileSync(
  'generated/spec-schema.json',
  JSON.stringify(zodToJsonSchema(SpecBundleForExport, 'SpecBundle'), null, 2),
);
console.log('generated/spec-schema.json yazıldı');
