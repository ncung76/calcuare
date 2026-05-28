const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  [/md:px-10/g, 'lg:px-10'],
  [/md:py-6/g, 'lg:py-6'],
  [/flex-col md:flex-row/g, 'flex-col lg:flex-row'],
  [/md:items-baseline/g, 'lg:items-baseline'],
  [/md:gap-/g, 'lg:gap-'],
  [/md:text-/g, 'lg:text-'],
  [/block md:inline/g, 'block lg:inline'],
  [/hidden md:flex/g, 'hidden lg:flex'],
  [/md:ml-0/g, 'lg:ml-0'],
  [/md:border-l/g, 'lg:border-l'],
  [/md:pl-4/g, 'lg:pl-4'],
  [/md:mb-[0-9]+/g, function(match){ return match.replace('md:', 'lg:'); }],
  [/w-full md:w-\[300px\] /g, 'w-full '],
  [/hidden md:block/g, 'hidden lg:block'],
  [/md:h-auto/g, 'lg:h-auto'],
  [/md:left-6/g, 'lg:left-6'],
  [/md:right-auto/g, 'lg:right-auto'],
  [/md:w-\[320px\] /g, 'lg:w-[320px] '],
  [/md:bottom-10/g, 'lg:bottom-10'],
  [/w-full md:w-\[320px\] lg:w-\[380px\]/g, 'w-full lg:w-[380px]'],
  [/md:hidden/g, 'lg:hidden'],
  [/md:max-h-\[85vh\]/g, 'lg:max-h-[85vh]'],
];

replacements.forEach(([regex, replacement]) => {
  content = content.replace(regex, replacement);
});

fs.writeFileSync('src/App.tsx', content);
