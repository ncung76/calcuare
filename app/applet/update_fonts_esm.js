import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf-8');

const replacements = {
  'text-[10px]': 'text-[11px]',
  'text-[11px]': 'text-[12px]',
  'text-xs': 'text-[14px]',
  'text-sm': 'text-[16px]',
  'text-base': 'text-[18px]',
  'text-lg': 'text-[20px]',
  'text-xl': 'text-[22px]',
  'text-2xl': 'text-[26px]',
  'text-3xl': 'text-[33px]',
  'text-4xl': 'text-[40px]',
  'text-5xl': 'text-[53px]',
};

for (const [search, replace] of Object.entries(replacements)) {
  content = content.split(search).join(replace);
}

fs.writeFileSync('src/App.tsx', content);
console.log('Done script');
