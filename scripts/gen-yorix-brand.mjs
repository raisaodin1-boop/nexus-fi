import fs from "fs";

const lh = fs.readFileSync("assets/brand/yorix-letterhead.png").toString("base64");
const st = fs.readFileSync("assets/brand/yorix-stamp.png").toString("base64");

fs.writeFileSync(
  "src/yorix-brand-images.ts",
  `// Auto-generated — run: node scripts/gen-yorix-brand.mjs
export const YORIX_LETTERHEAD_B64 = ${JSON.stringify(lh)};
export const YORIX_STAMP_B64 = ${JSON.stringify(st)};
`,
);

console.log("Generated src/yorix-brand-images.ts", { letterhead: lh.length, stamp: st.length });
