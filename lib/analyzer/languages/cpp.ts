import type { Issue } from '../types';
import type { LanguageModule } from './index';

function detectRawPointer(code: string): Issue[] {
    const issues: Issue[] = [];
    const newDeletePattern = /\b(new|delete)\s+/;

    code.split('\n').forEach((line, idx) => {
        const clean = line.replace(/\/\/.*$/, '');
        if (newDeletePattern.test(clean)) {
            issues.push({
                type: 'raw_pointer',
                category: 'language',
                severity: 'high',
                priority: 'quick-win', // ✅ FIXED
                message: 'Use smart pointers (unique_ptr, shared_ptr) instead of new/delete.',
                line: idx + 1,
            });
        }
    });

    return issues;
}

function detectUsingNamespaceStd(code: string): Issue[] {
    const issues: Issue[] = [];
    const usingNamespacePattern = /using\s+namespace\s+std\s*;/;

    code.split('\n').forEach((line, idx) => {
        const clean = line.replace(/\/\/.*$/, '');
        if (usingNamespacePattern.test(clean)) {
            issues.push({
                type: 'using_namespace_std',
                category: 'language',
                severity: 'medium',
                priority: 'quick-win',
                message: 'Avoid "using namespace std;". Use explicit std:: or specific declarations.',
                line: idx + 1,
            });
        }
    });

    return issues;
}

function detectEmptyDestructor(code: string): Issue[] {
    const issues: Issue[] = [];
    const emptyDestructorPattern = /~\w+\s*\(\s*\)\s*\{\s*\}/;

    code.split('\n').forEach((line, idx) => {
        const clean = line.replace(/\/\/.*$/, '');
        if (emptyDestructorPattern.test(clean)) {
            issues.push({
                type: 'empty_destructor',
                category: 'language',
                severity: 'low',
                priority: 'quick-win',
                message: 'Remove empty destructors; compiler generates them automatically.',
                line: idx + 1,
            });
        }
    });

    return issues;
}

function detectLongFunction(code: string): Issue[] {
    const issues: Issue[] = [];
    const lines = code.split('\n');
    let funcStartLine = -1;
    let funcName = '';
    let braceCount = 0;
    let inFunc = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const clean = line.replace(/\/\/.*$/, '').trim();

        if (/^\w+\s+[\w:]+\s*\(/.test(clean) && !clean.includes('class ') && !clean.includes('struct ')) {
            if (funcStartLine !== -1 && inFunc) {
                const funcLength = i - funcStartLine - 1;
                if (funcLength > 60) {
                    issues.push({
                        type: 'long_function',
                        category: 'language',
                        severity: 'low',
                        priority: 'quick-win', // ✅ FIXED
                        message: `Function "${funcName}" is ${funcLength} lines.`,
                        line: funcStartLine + 1,
                    });
                }
            }

            const match = clean.match(/\s+([\w:]+)\s*\(/);
            funcName = match ? match[1] : 'unknown';
            funcStartLine = i;
            inFunc = true;
            braceCount = 0;
        }

        if (inFunc) {
            braceCount += (clean.match(/\{/g) || []).length;
            braceCount -= (clean.match(/\}/g) || []).length;

            if (braceCount === 0 && funcStartLine !== i) {
                const funcLength = i - funcStartLine - 1;
                if (funcLength > 60) {
                    issues.push({
                        type: 'long_function',
                        category: 'language',
                        severity: 'low',
                        priority: 'quick-win', // ✅ FIXED
                        message: `Function "${funcName}" is ${funcLength} lines.`,
                        line: funcStartLine + 1,
                    });
                }
                inFunc = false;
                funcStartLine = -1;
            }
        }
    }

    return issues;
}

function detectPatterns(code: string): Issue[] {
    const issues: Issue[] = [];
    issues.push(...detectRawPointer(code));
    issues.push(...detectUsingNamespaceStd(code));
    issues.push(...detectEmptyDestructor(code));
    issues.push(...detectLongFunction(code));

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

    if (typeSet.has('raw_pointer')) hints.push('Use std::unique_ptr or std::shared_ptr');
    if (typeSet.has('using_namespace_std')) hints.push('Use explicit std:: or specific using');
    if (typeSet.has('empty_destructor')) hints.push('Remove unnecessary empty destructors');
    if (typeSet.has('long_function')) hints.push('Break long functions into smaller ones');

    return hints.slice(0, 3); // ✅ FIXED: max 3
}

export const cppModule: LanguageModule = {
    id: 'cpp',
    displayName: 'C++',
    extensions: ['.cpp', '.cc', '.cxx', '.h', '.hpp'],
    detectPatterns,
    getPromptHints,
};