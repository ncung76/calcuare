const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

// The original sizes were: text-[10px], text-[11px], text-[9px], text-xs, text-sm, text-lg, text-xl, text-2xl
// I already replaced text-[10px] with text-[11px]. 
// But now there's original text-[11px] scattered. There were originally five text-[11px].
// To be safe, I'll just change EVERY text size to its next bigger size.
content = content.replace(/text-\[9px\]/g, 'text-_10px_');
content = content.replace(/text-\[11px\]/g, 'text-_12px_');
content = content.replace(/text-xs/g, 'text-_13px_');
content = content.replace(/text-sm/g, 'text-_15px_');
content = content.replace(/text-base/g, 'text-_18px_');
content = content.replace(/text-lg/g, 'text-_20px_');
content = content.replace(/text-xl/g, 'text-_22px_');
content = content.replace(/text-2xl/g, 'text-_26px_');

// Now re-replace the temporaries
content = content.replace(/text-_/g, 'text-[').replace(/px\_/g, 'px]');
content = content.replace(/text-\[10px\]/g, 'text-[10px]');
content = content.replace(/text-\[12px\]/g, 'text-[12px]');
content = content.replace(/text-\[13px\]/g, 'text-[13px]');
content = content.replace(/text-\[15px\]/g, 'text-[15px]');
content = content.replace(/text-\[18px\]/g, 'text-[18px]');
content = content.replace(/text-\[20px\]/g, 'text-[20px]');
content = content.replace(/text-\[22px\]/g, 'text-[22px]');
content = content.replace(/text-\[26px\]/g, 'text-[26px]');

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx fonts updated successfully');

