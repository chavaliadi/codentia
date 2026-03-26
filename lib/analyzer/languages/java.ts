import type { Issue } from '../types';
import type { LanguageModule } from './index';

function detectGenericException(code: string): Issue[] {
    const issues: Issue[] = [];
    const genericExceptionPattern = /catch\s*\(\s*Exception\s+\w+\s*\)/;

    code.split('\n').forEach((line, idx) => {
        const clean = line.replace(/\/\/.*$/, '');
        if (genericExceptionPattern.test(clean)) {
            issues.push({
                type: 'generic_exception',
                category: 'language',
                severity: 'high',
                priority: 'quick-win', // ✅ FIXED
                message: 'Catch specific exceptions, not generic Exception.',
                line: idx + 1,
            });
        }
    });

    return issues;
}

function detectPublicField(code: string): Issue[] {
    const issues: Issue[] = [];
    const publicFieldPattern = /public\s+(?!static\s+final)\w+\s+\w+\s*[=;]/;

    code.split('\n').forEach((line, idx) => {
        const clean = line.replace(/\/\/.*$/, '');
        if (publicFieldPattern.test(clean) && !clean.includes('public static final')) {
            issues.push({
                type: 'public_field',
                category: 'language',
                severity: 'medium',
                priority: 'quick-win',
                message: 'Use private fields with getter/setter instead of public.',
                line: idx + 1,
            });
        }
    });

    return issues;
}

function detectLongMethod(code: string): Issue[] {
    const issues: Issue[] = [];
    const lines = code.split('\n');
    let methodStartLine = -1;
    let methodName = '';
    let braceCount = 0;
    let inMethod = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const clean = line.replace(/\/\/.*$/, '').trim();

        if (/^(public|private|protected)?\s*(static\s+)?\w+\s+\w+\s*\(/.test(clean)) {
            if (methodStartLine !== -1 && inMethod) {
                const methodLength = i - methodStartLine - 1;
                if (methodLength > 60) {
                    issues.push({
                        type: 'long_method',
                        category: 'language',
                        severity: 'low',
                        priority: 'quick-win', // ✅ FIXED
                        message: `Method "${methodName}" is ${methodLength} lines.`,
                        line: methodStartLine + 1,
                    });
                }
            }

            const match = clean.match(/\s+(\w+)\s*\(/);
            methodName = match ? match[1] : 'unknown';
            methodStartLine = i;
            inMethod = true;
            braceCount = 0;
        }

        if (inMethod) {
            braceCount += (clean.match(/\{/g) || []).length;
            braceCount -= (clean.match(/\}/g) || []).length;

            if (braceCount === 0 && methodStartLine !== i) {
                const methodLength = i - methodStartLine - 1;
                if (methodLength > 60) {
                    issues.push({
                        type: 'long_method',
                        category: 'language',
                        severity: 'low',
                        priority: 'quick-win', // ✅ FIXED
                        message: `Method "${methodName}" is ${methodLength} lines.`,
                        line: methodStartLine + 1,
                    });
                }
                inMethod = false;
                methodStartLine = -1;
            }
        }
    }

    return issues;
}

function detectEmptyCatch(code: string): Issue[] {
    const issues: Issue[] = [];
    const emptyCatchPattern = /catch\s*\(\s*\w+\s+\w+\s*\)\s*\{\s*\}/;

    code.split('\n').forEach((line, idx) => {
        const clean = line.replace(/\/\/.*$/, '');
        if (emptyCatchPattern.test(clean)) {
            issues.push({
                type: 'empty_catch',
                category: 'language',
                severity: 'high',
                priority: 'quick-win', // ✅ FIXED
                message: 'Empty catch block silently swallows exceptions.',
                line: idx + 1,
            });
        }
    });

    return issues;
}

function detectPatterns(code: string): Issue[] {
    const issues: Issue[] = [];
    issues.push(...detectGenericException(code));
    issues.push(...detectPublicField(code));
    issues.push(...detectLongMethod(code));
    issues.push(...detectEmptyCatch(code));

    const seen = new Set<string>();
    return issues.filter((issue) => {
        const key = `${issue.line}-${issue.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getPromptHints(issues: Issue[]): string[] {
    const hints: string[] = [];
    const typeSet = new Set(issues.map((i) => i.type));

    if (typeSet.has('generic_exception')) hints.push('Catch specific exception types');
    if (typeSet.has('public_field')) hints.push('Encapsulate with private fields');
    if (typeSet.has('long_method')) hints.push('Break long methods into smaller ones');
    if (typeSet.has('empty_catch')) hints.push('Add error handling in catch blocks');

    return hints.slice(0, 3); // ✅ FIXED: max 3
}

export const javaModule: LanguageModule = {
    id: 'java',
    displayName: 'Java',
    extensions: ['.java'],
    detectPatterns,
    getPromptHints,
};