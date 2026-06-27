const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../node_modules/tree-sitter-wasms/out');
const coreSrc1 = path.join(__dirname, '../node_modules/web-tree-sitter/tree-sitter.wasm');
const coreSrc2 = path.join(__dirname, '../node_modules/web-tree-sitter/web-tree-sitter.wasm');
const destDir = path.join(__dirname, '../public/wasm');

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

// Copy core WASM file
if (fs.existsSync(coreSrc1)) {
    fs.copyFileSync(coreSrc1, path.join(destDir, 'tree-sitter.wasm'));
    console.log('Copied tree-sitter.wasm');
} else if (fs.existsSync(coreSrc2)) {
    fs.copyFileSync(coreSrc2, path.join(destDir, 'tree-sitter.wasm'));
    console.log('Copied web-tree-sitter.wasm as tree-sitter.wasm');
} else {
    console.error('Core tree-sitter.wasm not found in node_modules.');
}

// Copy language grammars
const langs = ['python', 'go', 'java', 'cpp', 'rust', 'c_sharp'];
for (const lang of langs) {
    const filename = `tree-sitter-${lang}.wasm`;
    const src = path.join(srcDir, filename);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(destDir, filename));
        console.log(`Copied ${filename}`);
    } else {
        console.warn(`Warning: Grammar file ${filename} not found in node_modules.`);
    }
}

console.log('Tree-sitter WASM assets copied successfully.');
