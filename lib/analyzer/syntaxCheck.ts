import Parser from 'web-tree-sitter';
import path from 'node:path';
import type { CorrectnessResult, Grade, SyntaxErrorDetail } from './types';

function gradeFromScore(score: number): Grade {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Critical';
}

let parserInitPromise: Promise<void> | null = null;
async function ensureParserInit() {
    if (!parserInitPromise) {
        parserInitPromise = Parser.init({
            locateFile: (scriptName: string) => path.join(process.cwd(), 'public/wasm', scriptName)
        });
    }
    return parserInitPromise;
}

const languageLoaders = new Map<string, Promise<Parser.Language>>();
async function getLanguage(langName: string): Promise<Parser.Language> {
    const key = langName.toLowerCase();
    if (!languageLoaders.has(key)) {
        const loadPromise = (async () => {
            await ensureParserInit();
            const wasmFile = `tree-sitter-${key === 'c#' ? 'c_sharp' : key}.wasm`;
            const wasmPath = path.join(process.cwd(), 'public/wasm', wasmFile);
            return await Parser.Language.load(wasmPath);
        })();
        languageLoaders.set(key, loadPromise);
    }
    return languageLoaders.get(key)!;
}

function collectErrors(node: Parser.SyntaxNode, errors: SyntaxErrorDetail[]) {
    if (node.type === 'ERROR') {
        const sample = node.text.slice(0, 60).trim();
        errors.push({
            message: `Syntax error near '${sample || node.type}'`,
            line: node.startPosition.row + 1,
            column: node.startPosition.column + 1,
        });
    } else if (node.isMissing()) {
        errors.push({
            message: `Missing expected token: ${node.type}`,
            line: node.startPosition.row + 1,
            column: node.startPosition.column + 1,
        });
    }

    for (let i = 0; i < node.childCount; i++) {
        collectErrors(node.child(i)!, errors);
    }
}

export async function checkSyntaxByLanguage(code: string, language: string): Promise<CorrectnessResult> {
    const normalized = language.toLowerCase();
    
    let langKey = '';
    if (normalized === 'py' || normalized === 'python') langKey = 'python';
    else if (normalized === 'go' || normalized === 'golang') langKey = 'go';
    else if (normalized === 'java') langKey = 'java';
    else if (normalized === 'cpp') langKey = 'cpp';
    else if (normalized === 'rust') langKey = 'rust';
    else if (normalized === 'c#') langKey = 'c_sharp';
    
    if (!langKey) {
        return { status: 'unknown', syntaxErrors: [] };
    }

    try {
        const lang = await getLanguage(langKey);
        const parser = new Parser();
        parser.setLanguage(lang);
        const tree = parser.parse(code);

        if (!tree || !tree.rootNode) {
            return { status: 'unknown', syntaxErrors: [] };
        }

        if (!tree.rootNode.hasError()) {
            return { status: 'pass', syntaxErrors: [] };
        }

        const errors: SyntaxErrorDetail[] = [];
        collectErrors(tree.rootNode, errors);

        return {
            status: 'fail',
            syntaxErrors: errors.slice(0, 10), // Limit error list sizing
        };
    } catch (err) {
        console.error(`[syntaxCheck] Tree-sitter error for ${language}:`, err);
        return { status: 'unknown', syntaxErrors: [] };
    }
}

export function applyCorrectnessCap(score: number, correctness: CorrectnessResult): { score: number; grade: Grade } {
    const adjusted = correctness.status === 'fail' ? Math.min(score, 60) : score;
    return { score: adjusted, grade: gradeFromScore(adjusted) };
}
