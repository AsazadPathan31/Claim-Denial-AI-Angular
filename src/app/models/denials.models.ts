export interface DenialData {
  claim_id: string;
  payer: string;
  patient_name?: string;
  dos?: string;
  billed_amount?: number;
  denial_codes: string[];
  denial_reason_text?: string;
  cpt_codes: string[];
  icd_codes: string[];
}

// denial.models.ts
export interface AnalysisResult {
  root_cause: string[]; // Always array now
  action_required: string[]; // Always array now
  appeal_potential: 'high' | 'medium' | 'low';
  billing_action: 'rebill' | 'appeal' | 'write_off' | 'patient_bill';
}

export interface QuickAnalysisResponse {
  claim_id: string;
  analysis: AnalysisResult;
  codes_analyzed: string[];
  timestamp: number;
}

export interface FileUploadResponse {
  extracted_denials: DenialData[];
  raw_codes_found: {
    carc: string[];
    rarc: string[];
    groups: string[];
  };
  processing_notes: string[];
}

export interface CommonDenialReason {
  title: string;
  action: string;
}

export interface SupportedFormat {
  format: string;
  extensions: string[];
  description: string;
}
