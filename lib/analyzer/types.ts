export type Grade = 'Excellent' | 'Good' | 'Fair' | 'Critical';
export type Severity = 'high' | 'medium' | 'low';
export type Priority = 'quick-win' | 'structural';
export type IssueCategory = 'structural' | 'language';
export type IssueType =
  | 'complexity'
  | 'length'
  | 'nesting'
  | 'duplication'
  | 'unused_imports'
  | 'empty_catch'
  | 'redundant_else'
  | 'bool_comparison'
  | 'long_params'
  | 'condition_chain'
  | 'bare_except'
  | 'mutable_default_arg'
  | 'none_comparison'
  | 'long_function'
  | 'ignored_error'
  | 'empty_err_check'
  | 'panic_usage'
  | 'generic_exception'
  | 'public_field'
  | 'long_method'
  | 'raw_pointer'
  | 'using_namespace_std'
  | 'empty_destructor';

export interface Issue {
  type: IssueType;
  category: IssueCategory;
  severity: Severity;
  priority: Priority;
  message: string;
  line?: number;
  name?: string; // function / block name if applicable
}

export interface MetricsSummary {
  avgCyclomaticComplexity: number;
  maxCyclomaticComplexity: number;
  avgFunctionLength: number;
  maxFunctionLength: number;
  maxNestingDepth: number;
  duplicationPercentage: number;
  unusedImportCount: number;
  totalFunctions: number;
  totalLines: number;
}

export type CorrectnessStatus = 'pass' | 'fail' | 'unknown';

export interface SyntaxErrorDetail {
  message: string;
  line?: number;
  column?: number;
  reasonCode?: string;
}

export interface LintErrorDetail {
  rule: string;
  message: string;
  line?: number;
  column?: number;
}

export interface CorrectnessResult {
  status: CorrectnessStatus;
  syntaxErrors: SyntaxErrorDetail[];
  lintErrors?: LintErrorDetail[];
}

export interface AnalysisResult {
  score: number;
  grade: Grade;
  issues: Issue[];
  metrics: MetricsSummary;
  correctness?: CorrectnessResult;
  aiExplanation: string;
  estimatedImprovement?: number; // pts if quick wins addressed
}
