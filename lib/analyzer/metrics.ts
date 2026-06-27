import traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { File } from '@babel/types';
import type { Issue, MetricsSummary, IssueType, Severity, Priority } from './types';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Determine priority based on issue type and severity */
function determinePriority(type: IssueType, severity: Severity): Priority {
    // Quick wins: easy fixes, low effort
    if (type === 'unused_imports') return 'quick-win';
    if (severity === 'low') return 'quick-win';
    if (type === 'duplication' && severity === 'medium') return 'quick-win';

    // Structural: requires refactoring
    return 'structural';
}

function countLines(node: t.Node): number {
    if (!node.loc) return 0;
    return node.loc.end.line - node.loc.start.line + 1;
}

/** Count decision points in a node subtree for cyclomatic complexity */
function computeComplexity(path: { node: t.Node }): number {
    let complexity = 1; // base path
    const node = path.node;

    // We do a quick recursive walk of children
    const decisionTypes = new Set([
        'IfStatement',
        'ConditionalExpression',
        'LogicalExpression',
        'ForStatement',
        'ForInStatement',
        'ForOfStatement',
        'WhileStatement',
        'DoWhileStatement',
        'SwitchCase',
        'CatchClause',
        'BinaryExpression',
    ]);

    function walk(n: t.Node) {
        if (!n || typeof n !== 'object') return;
        if (decisionTypes.has(n.type)) {
            // Only count && and || for LogicalExpression / BinaryExpression
            if (n.type === 'LogicalExpression' || n.type === 'BinaryExpression') {
                const op = (n as t.LogicalExpression | t.BinaryExpression).operator;
                if (op === '&&' || op === '||' || op === '??') complexity++;
            } else {
                complexity++;
            }
        }
        for (const key of Object.keys(n)) {
            const child = (n as unknown as Record<string, unknown>)[key];
            if (Array.isArray(child)) {
                child.forEach((c) => { if (c && typeof c === 'object' && 'type' in c) walk(c as t.Node); });
            } else if (child && typeof child === 'object' && 'type' in child) {
                walk(child as t.Node);
            }
        }
    }

    walk(node);
    return complexity;
}

/** Measure max nesting depth of block statements */
function measureMaxDepth(ast: t.File): number {
    let globalMax = 0;

    traverse(ast, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        BlockStatement(path: any) {
            let depth = 0;
            let current = path.parentPath;
            while (current) {
                if (current.isBlockStatement()) depth++;
                current = current.parentPath;
            }
            if (depth > globalMax) globalMax = depth;
        },
    });

    return globalMax;
}

/** Simple line-hash duplication detection */
function detectDuplication(code: string): number {
    const lines = code.split('\n').map((l) => l.trim()).filter((l) => l.length > 4);
    const windowSize = 5;
    const seen = new Map<string, number>();
    let duplicateWindows = 0;
    let totalWindows = 0;

    for (let i = 0; i <= lines.length - windowSize; i++) {
        const block = lines.slice(i, i + windowSize).join('\n');
        const count = seen.get(block) ?? 0;
        seen.set(block, count + 1);
        totalWindows++;
        if (count > 0) duplicateWindows++;
    }

    if (totalWindows === 0) return 0;
    return Math.round((duplicateWindows / totalWindows) * 100);
}

/** Detect empty catch blocks */
function detectEmptyCatchBlocks(ast: t.File): Array<{ line: number }> {
    const issues: Array<{ line: number }> = [];

    traverse(ast, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        CatchClause(path: any) {
            const node = path.node as t.CatchClause;
            // Empty if body has no statements
            if (node.body.body.length === 0) {
                issues.push({ line: node.loc?.start.line ?? 0 });
            }
        },
    });

    return issues;
}

/** Detect redundant else blocks after return/throw */
function detectRedundantElse(ast: t.File): Array<{ line: number; fnName: string }> {
    const issues: Array<{ line: number; fnName: string }> = [];

    traverse(ast, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        IfStatement(path: any) {
            const node = path.node as t.IfStatement;

            // Check if consequent ends with return or throw
            let hasFinalReturn = false;
            const lastStmt = (node.consequent as t.BlockStatement).body?.[
                (node.consequent as t.BlockStatement).body.length - 1
            ];
            if (lastStmt && (t.isReturnStatement(lastStmt) || t.isThrowStatement(lastStmt))) {
                hasFinalReturn = true;
            }

            // If there's a return/throw and an else block, flag it
            if (hasFinalReturn && node.alternate) {
                // Find function name
                let fnName = 'anonymous';
                const parent = path.getFunctionParent();
                if (parent?.node?.id) fnName = parent.node.id.name;
                issues.push({ line: node.alternate.loc?.start.line ?? 0, fnName });
            }
        },
    });

    return issues;
}

/** Detect boolean comparisons: x === true, x == false, etc. */
function detectBooleanComparisons(ast: t.File): Array<{ line: number }> {
    const issues: Array<{ line: number }> = [];

    traverse(ast, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        BinaryExpression(path: any) {
            const node = path.node as t.BinaryExpression;
            if (!['===', '==', '!==', '!='].includes(node.operator)) return;

            // Check if right side is true/false/True/False literal
            const right = node.right;
            const isBoolComparison =
                (t.isBooleanLiteral(right) && (right as t.BooleanLiteral).value !== null) ||
                (t.isIdentifier(right) && ['true', 'false', 'True', 'False'].includes(right.name));

            if (isBoolComparison) {
                issues.push({ line: node.loc?.start.line ?? 0 });
            }
        },
    });

    return issues;
}

/** Detect long parameter lists (>5 parameters) */
function detectLongParamLists(ast: t.File): Array<{ line: number; fnName: string; paramCount: number }> {
    const issues: Array<{ line: number; fnName: string; paramCount: number }> = [];

    traverse(ast, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression'(path: any) {
            const node = path.node as t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression;
            const paramCount = node.params.length;

            if (paramCount > 5) {
                let fnName = 'anonymous';
                if (t.isFunctionDeclaration(node) && node.id) {
                    fnName = node.id.name;
                } else if (
                    path.parentPath?.isVariableDeclarator() &&
                    t.isIdentifier((path.parentPath.node as t.VariableDeclarator).id)
                ) {
                    fnName = ((path.parentPath.node as t.VariableDeclarator).id as t.Identifier).name;
                }
                issues.push({ line: node.loc?.start.line ?? 0, fnName, paramCount });
            }
        },
    });

    return issues;
}

/** Detect repeated condition chains (3+ consecutive if-else-if) */
function detectConditionChains(ast: t.File): Array<{ line: number }> {
    const issues: Array<{ line: number }> = [];

    traverse(ast, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        IfStatement(path: any) {
            let count = 0;
            let current = path.node as t.IfStatement;

            // Count chain depth
            while (current.alternate && t.isIfStatement(current.alternate)) {
                count++;
                current = current.alternate as t.IfStatement;
            }

            // Flag if 3 or more in chain
            if (count >= 2) {
                issues.push({ line: path.node.loc?.start.line ?? 0 });
            }
        },
    });

    return issues;
}

/** Detect declared imports vs actual usages */
function detectUnusedImports(ast: t.File): string[] {
    const imported: Map<string, number> = new Map(); // name -> line
    const usedIdentifiers = new Set<string>();

    traverse(ast, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ImportDeclaration(path: any) {
            for (const spec of path.node.specifiers) {
                const name =
                    t.isImportDefaultSpecifier(spec) || t.isImportNamespaceSpecifier(spec)
                        ? spec.local.name
                        : (spec as t.ImportSpecifier).local.name;
                imported.set(name, path.node.loc?.start.line ?? 0);
            }
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Identifier(path: any) {
            // Skip the import declarations themselves
            if (path.parentPath?.isImportSpecifier() || path.parentPath?.isImportDefaultSpecifier()) return;
            usedIdentifiers.add(path.node.name);
        },
        // JSX elements like <Zap /> use JSXIdentifier nodes, NOT regular Identifier nodes
        // Without this, every imported React component would be falsely flagged as unused
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        JSXIdentifier(path: any) {
            usedIdentifiers.add(path.node.name);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        JSXMemberExpression(path: any) {
            usedIdentifiers.add(path.node.object.name);
        },
    });

    return Array.from(imported.keys()).filter((name) => !usedIdentifiers.has(name));
}

// ─── main export ─────────────────────────────────────────────────────────────

export interface RawMetrics {
    summary: MetricsSummary;
    issues: Issue[];
    imports: string[];
}

export function computeMetrics(ast: t.File, code: string): RawMetrics {
    const issues: Issue[] = [];
    const functionComplexities: number[] = [];
    const functionLengths: number[] = [];
    const imports: string[] = [];

    // ── function-level metrics ──
    traverse(ast, {
        ImportDeclaration(path: any) {
            if (path.node.source?.value) {
                imports.push(path.node.source.value);
            }
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression'(path: any) {
            const node = path.node as t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression;
            const lines = countLines(node);
            const complexity = computeComplexity(path);

            functionComplexities.push(complexity);
            functionLengths.push(lines);

            // name heuristic
            let fnName = 'anonymous';
            if (t.isFunctionDeclaration(node) && node.id) {
                fnName = node.id.name;
            } else if (
                path.parentPath?.isVariableDeclarator() &&
                t.isIdentifier((path.parentPath.node as t.VariableDeclarator).id)
            ) {
                fnName = ((path.parentPath.node as t.VariableDeclarator).id as t.Identifier).name;
            } else if (
                path.parentPath?.isObjectProperty() &&
                t.isIdentifier((path.parentPath.node as t.ObjectProperty).key)
            ) {
                fnName = ((path.parentPath.node as t.ObjectProperty).key as t.Identifier).name;
            }

            const startLine = node.loc?.start.line;

            if (complexity >= 10) {
                const severity: Severity = complexity >= 15 ? 'high' : 'medium';
                issues.push({
                    type: 'complexity',
                    category: 'structural',
                    severity,
                    priority: determinePriority('complexity', severity),
                    message: `"${fnName}" has ${complexity} decision paths through it. Splitting it into smaller focused functions would make it easier to read and test.`,
                    line: startLine,
                    name: fnName,
                    confidence: 100,
                    method: 'AST',
                });
            }

            if (lines > 50) {
                const severity: Severity = lines > 100 ? 'high' : 'medium';
                issues.push({
                    type: 'length',
                    category: 'structural',
                    severity,
                    priority: determinePriority('length', severity),
                    message: `"${fnName}" is ${lines} lines long. Breaking it into 2–3 smaller functions would make it much easier to scan and maintain.`,
                    line: startLine,
                    name: fnName,
                    confidence: 100,
                    method: 'AST',
                });
            }
        },
    });

    // ── nesting depth ──
    const maxDepth = measureMaxDepth(ast);
    if (maxDepth >= 4) {
        const severity: Severity = maxDepth >= 6 ? 'high' : 'medium';
        issues.push({
            type: 'nesting',
            category: 'structural',
            severity,
            priority: determinePriority('nesting', severity),
            message: `Some logic here is nested ${maxDepth} levels deep, which can be tricky to follow. Early returns or small helper functions could make this much clearer.`,
            confidence: 100,
            method: 'AST',
        });
    }

    // ── duplication ──
    const dupePct = detectDuplication(code);
    if (dupePct > 15) {
        const severity: Severity = dupePct > 30 ? 'high' : 'medium';
        issues.push({
            type: 'duplication',
            category: 'structural',
            severity,
            priority: determinePriority('duplication', severity),
            message: `About ${dupePct}% of code blocks look similar to each other. Pulling shared logic into a helper function would reduce repetition and make future edits easier.`,
            confidence: 85,
            method: 'AST + similarity',
        });
    }

    // ── unused imports ──
    const unused = detectUnusedImports(ast);
    if (unused.length > 0) {
        unused.forEach((name) => {
            issues.push({
                type: 'unused_imports',
                category: 'structural',
                severity: 'low',
                priority: 'quick-win',
                message: `"${name}" is imported but not used anywhere. Removing it keeps things tidy and slightly reduces bundle size.`,
                name,
                confidence: 100,
                method: 'AST',
            });
        });
    }

    // ── micro-patterns: empty catch blocks ──
    const emptyCatches = detectEmptyCatchBlocks(ast);
    emptyCatches.forEach((catch_) => {
        issues.push({
            type: 'empty_catch',
            category: 'structural',
            severity: 'medium',
            priority: 'quick-win',
            message: `Empty catch block silently swallows errors. Either log them, rethrow, or document why it's safe to ignore.`,
            line: catch_.line,
            confidence: 100,
            method: 'AST',
        });
    });

    // ── micro-patterns: redundant else ──
    const redundantElses = detectRedundantElse(ast);
    redundantElses.forEach((issue) => {
        issues.push({
            type: 'redundant_else',
            category: 'structural',
            severity: 'low',
            priority: 'quick-win',
            message: `Else block after a return/throw is unnecessary. Dedent the else content to simplify the flow.`,
            line: issue.line,
            confidence: 100,
            method: 'AST',
        });
    });

    // ── micro-patterns: boolean comparisons ──
    const boolComparisons = detectBooleanComparisons(ast);
    boolComparisons.forEach((comp) => {
        issues.push({
            type: 'bool_comparison',
            category: 'structural',
            severity: 'low',
            priority: 'quick-win',
            message: `Comparing to true/false is redundant. Use the variable directly or negate it instead.`,
            line: comp.line,
            confidence: 100,
            method: 'AST',
        });
    });

    // ── micro-patterns: long parameter lists ──
    const longParams = detectLongParamLists(ast);
    longParams.forEach((fn) => {
        issues.push({
            type: 'long_params',
            category: 'structural',
            severity: 'medium',
            priority: 'structural',
            message: `"${fn.fnName}" has ${fn.paramCount} parameters. Wrapping them in a config object or splitting the function would make it easier to extend.`,
            line: fn.line,
            name: fn.fnName,
            confidence: 100,
            method: 'AST',
        });
    });

    // ── micro-patterns: condition chains ──
    const condChains = detectConditionChains(ast);
    condChains.forEach((chain) => {
        issues.push({
            type: 'condition_chain',
            category: 'structural',
            severity: 'low',
            priority: 'quick-win',
            message: `Long if-else-if chain can be hard to follow. Consider a switch statement or a lookup object for clarity.`,
            line: chain.line,
            confidence: 100,
            method: 'AST',
        });
    });

    const avg = (arr: number[]) =>
        arr.length === 0 ? 0 : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
    const max = (arr: number[]) => (arr.length === 0 ? 0 : Math.max(...arr));

    const summary: MetricsSummary = {
        avgCyclomaticComplexity: avg(functionComplexities),
        maxCyclomaticComplexity: max(functionComplexities),
        avgFunctionLength: avg(functionLengths),
        maxFunctionLength: max(functionLengths),
        maxNestingDepth: maxDepth,
        duplicationPercentage: dupePct,
        unusedImportCount: unused.length,
        totalFunctions: functionComplexities.length,
        totalLines: code.split('\n').length,
    };

    return { summary, issues, imports };
}
