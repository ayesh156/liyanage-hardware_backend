// Plain JS script to convert frontend inventory data into backend seed data module
const fs = require('fs');
const path = require('path');

// Read frontend inventoryData.ts
const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'src', 'data', 'inventoryData.ts');
console.log(`Reading: ${frontendPath}`);

let content = fs.readFileSync(frontendPath, 'utf8');

// Normalize line endings to \n
content = content.replace(/\r\n/g, '\n');

// Find the array opening: "const rawInventoryItems: InventoryProduct[] = ["
const marker = 'const rawInventoryItems';
const arrayStart = content.indexOf(marker);
if (arrayStart === -1) {
  console.error('Could not find rawInventoryItems array in frontend data');
  process.exit(1);
}

// Search for the first '[' from marker position (it's on the same line)
const startBracket = content.indexOf('[', arrayStart);
if (startBracket === -1) {
  console.error('Could not find opening bracket');
  process.exit(1);
}

console.log(`Array opening at byte: ${startBracket}`);

// Find "];\n\n// Filter" which signals the end of rawInventoryItems array
const closingMatch = content.substring(startBracket).match(/\];\s*\/\/ Filter/);
if (!closingMatch || closingMatch.index === undefined) {
  console.error('Could not find closing "];" for the array');
  process.exit(1);
}

const endPos = startBracket + closingMatch.index; // position of ']'
const arrayBody = content.substring(startBracket, endPos + 1);
console.log(`Extracted array body length: ${arrayBody.length} chars`);

// Strip TypeScript-specific syntax
let cleanArray = arrayBody
  .replace(/\s+as const/g, '')     // Remove "as const"
  // Fix any trailing commas before close bracket
  .replace(/,\s*\]/g, '\n]');

const itemCount = (cleanArray.match(/{ id:/g) || []).length;
console.log(`Item count: ${itemCount}`);

// Build the output module
const output = `// ──────────────────────────────────────────────
// AUTO-GENERATED SEED DATA — Do not edit manually
// Extracted from frontend/src/data/inventoryData.ts
// ${new Date().toISOString()}
// ${itemCount} products
// ──────────────────────────────────────────────

export interface InventorySeedItem {
  id: string;
  searchKey: string;
  name: string;
  nameSi?: string;
  productCategory: string;
  categoryId?: string;
  categorySi?: string;
  barcode?: string;
  cost: number;
  lastPrice: number;
  salesPrice: number;
  displayPrice: number;
  storeQty: number;
  salesType: string;
  status: string;
}

export const rawInventoryItems: InventorySeedItem[] = ${cleanArray};

export const categoryNames: string[] = [
  ...new Set(rawInventoryItems.map(item => item.productCategory).filter(Boolean))
];
`;

const outputPath = path.join(__dirname, 'seedData.ts');
fs.writeFileSync(outputPath, output, 'utf8');
console.log(`Written: ${outputPath}`);
console.log(`Items: ${itemCount}`);