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

export interface CategoryScores {
  readability: number;      // nesting + function length
  maintainability: number;  // complexity + duplication
  cleanliness: number;      // unused imports + file org
  structure: number;        // function count balance
}

export interface Issue {
  type: IssueType;
  category: IssueCategory;
  severity: Severity;
  priority: Priority;
  message: string;
  line?: number;
  name?: string; // function / block name if applicable
  confidence?: number;
  method?: string;
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

export interface ArchitectureInsights {
  mermaidGraph: string;
  cycles: string[][];
  deadCode: string[];
  godFiles: string[];
}

export interface RootCauseCluster {
  folder: string;
  issueCount: number;
  affectedFiles: string[];
  categories: string[];
  architecturalTip: string;
}

export interface TopFix {
  rank: number;
  title: string;
  impact: 'High' | 'Medium' | 'Low';
  description: string;
}

export interface AnalysisResult {
  score: number;
  grade: Grade;
  issues: Issue[];
  metrics: MetricsSummary;
  correctness?: CorrectnessResult;
  aiExplanation: string;
  estimatedImprovement?: number; // pts if quick wins addressed
  categoryScores?: CategoryScores;
  imports?: string[];
}

export interface FileResult {
  filename: string;
  filePath: string;
  score: number;
  grade: Grade;
  correctnessStatus?: 'pass' | 'fail' | 'unknown';
  syntaxErrorCount?: number;
  topIssue: string | null;
  issueCount: number;
  metrics: MetricsSummary;
  mode: 'deep' | 'quick';
  imports?: string[];
}

export type CorrectnessConfidenceBand = 'high' | 'medium' | 'low' | 'unknown';

export interface CorrectnessSummary {
  filesFailedSyntax: number;
  filesUnchecked: number;
  filesChecked: number;
  passFiles: number;
  failFiles: number;
  confidenceBand: CorrectnessConfidenceBand;
}

export interface TopImprovement {
  area: string;
  description: string;
  affectedFiles: number;
  potentialGain: number;
}

export interface ProjectResult {
  projectScore: number;
  projectGrade: Grade;
  summary: string;
  fileResults: FileResult[];
  topImprovements: TopImprovement[];
  categoryScores: CategoryScores;
  correctnessSummary: CorrectnessSummary;
  totalFiles: number;
  totalLines: number;
  totalFunctions: number;
  aiExplanation: string;
  architectureInsights?: ArchitectureInsights;
  rootCauseClusters?: RootCauseCluster[];
  topFixes?: TopFix[];
}

