import * as babelParser from '@babel/parser';
import type { SyntaxErrorDetail } from './types';

type ParserErrorShape = {
    message?: string;
    loc?: { line?: number; column?: number };
    reasonCode?: string;
};

export function parseCode(code: string, language: 'js' | 'ts') {
    const ast = babelParser.parse(code, {
        sourceType: 'module',
        plugins: [
            language === 'ts' ? 'typescript' : 'flow',
            'jsx',
            'classProperties',
            'decorators-legacy',
            'dynamicImport',
            'optionalChaining',
            'nullishCoalescingOperator',
        ],
        errorRecovery: true, // don't throw on minor syntax issues
    });

    const syntaxErrors: SyntaxErrorDetail[] = (ast.errors ?? []).map((err) => {
        const parsedErr = err as ParserErrorShape;
        return {
        message: parsedErr.message ?? 'Syntax parse error',
        line: parsedErr.loc?.line,
        column: parsedErr.loc?.column,
        reasonCode: parsedErr.reasonCode,
        };
    });

    return { ast, syntaxErrors };
}
