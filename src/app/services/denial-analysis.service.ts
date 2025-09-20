import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  DenialData,
  QuickAnalysisResponse,
  FileUploadResponse,
  CommonDenialReason,
  SupportedFormat,
} from '../models/denials.models';

@Injectable({
  providedIn: 'root',
})
export class DenialAnalysisService {
  private readonly API_BASE_URL = 'http://localhost:8000'; // Update for production

  constructor(private http: HttpClient) {}

  // Health check
  checkHealth(): Observable<any> {
    return this.http
      .get(`${this.API_BASE_URL}/health`)
      .pipe(catchError(this.handleError));
  }

  // Get common denial reasons
  getCommonDenialReasons(): Observable<{
    common_denials: Record<string, CommonDenialReason>;
  }> {
    return this.http
      .get<{ common_denials: Record<string, CommonDenialReason> }>(
        `${this.API_BASE_URL}/denial-reasons`
      )
      .pipe(catchError(this.handleError));
  }

  // Upload ERA file
  uploadEraFile(
    file: File,
    payerName?: string
  ): Observable<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (payerName) {
      formData.append('payer_name', payerName);
    }

    return this.http
      .post<FileUploadResponse>(`${this.API_BASE_URL}/upload-era`, formData)
      .pipe(catchError(this.handleError));
  }

  // Quick analysis
  performQuickAnalysis(
    denialData: DenialData,
    model?: string
  ): Observable<QuickAnalysisResponse> {
    const payload = {
      denial_data: denialData,
      model: model || undefined,
    };

    return this.http
      .post<QuickAnalysisResponse>(
        `${this.API_BASE_URL}/quick-analysis`,
        payload
      )
      .pipe(catchError(this.handleError));
  }

  // Analyze pasted EOB
  analyzePastedEob(
    eobText: string,
    claimId?: string,
    payer?: string
  ): Observable<QuickAnalysisResponse> {
    const formData = new FormData();
    formData.append('eob_text', eobText);
    if (claimId) formData.append('claim_id', claimId);
    if (payer) formData.append('payer', payer);

    return this.http
      .post<QuickAnalysisResponse>(`${this.API_BASE_URL}/paste-eob`, formData)
      .pipe(catchError(this.handleError));
  }

  // Get supported formats
  getSupportedFormats(): Observable<{
    file_uploads: SupportedFormat[];
    manual_inputs: { method: string; description: string }[];
  }> {
    return this.http
      .get<{
        file_uploads: SupportedFormat[];
        manual_inputs: { method: string; description: string }[];
      }>(`${this.API_BASE_URL}/supported-formats`)
      .pipe(catchError(this.handleError));
  }

  private handleError(error: any): Observable<never> {
    console.error('API Error:', error);
    return throwError(
      () => new Error(error.error?.detail || 'An error occurred')
    );
  }
}
