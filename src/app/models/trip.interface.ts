export interface Trip {
  trip_id: string;
  payer: string;
  claim_id?: string;
  eob_text?: string;
  denial_codes: string[];
  comments?: string;
  dos?: string;
  pos?: string;
  cpt_hcpcs: string[];
  icd10: string[];
  demographics?: Record<string, any>;
}

export interface AnalysisResult {
  summary: string[];
  issues: Array<{
    code?: string;
    title?: string;
    detail?: string;
    evidence?: string;
  }>;
  actions: string[];
  risk: 'low' | 'medium' | 'high';
}

export interface AnalyzeTripResponse {
  trip_id: string;
  model: string;
  analysis: AnalysisResult;
  ts: number;
}

export interface AnalyzeRequest {
  trip: Trip;
  model?: string;
  deep_reasoning?: boolean;
}

export interface AppealDraftResponse {
  trip_id: string;
  appeal_or_checklist: string;
  model: string;
}

export interface CodesResponse {
  group_codes: Record<string, string>;
  carc: Record<string, { title: string; play: string }>;
}

export interface ERAParseResponse {
  carc: string[];
  rarc: string[];
  groups: string[];
  count: Record<string, number>;
}

export interface TripAnalysisSummary {
  trip_id: string;
  risk_level: 'low' | 'medium' | 'high';
  model: string;
  last_updated: string;
  summary_points: string[];
  primary_issues: number;
  action_count: number;
  full_analysis_available: boolean;
}

export interface TripAnalysisDetails {
  trip_id: string;
  payer: string;
  claim_id: string;
  denial_codes: string[];
  analysis: {
    summary: string[];
    issues: Array<{
      code: string;
      title: string;
      detail: string;
      evidence: string;
    }>;
    actions: string[];
    risk: string;
  };
  model: string;
  risk_level: string;
  created_at: string;
  updated_at: string;
}

export interface ApiError {
  status: number;
  message: string;
}
