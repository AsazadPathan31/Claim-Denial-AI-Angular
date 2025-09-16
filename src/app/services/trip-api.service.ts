import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, Observable, retry, throwError } from 'rxjs';
import { environment } from '../environments/environment';
import {
  Trip,
  AnalyzeRequest,
  AnalyzeTripResponse,
  AppealDraftResponse,
  CodesResponse,
  ERAParseResponse,
  TripAnalysisSummary,
  TripAnalysisDetails,
} from '../models/trip.interface';

@Injectable({ providedIn: 'root' })
export class TripApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiBaseUrl;

  // Health check
  checkHealth(): Observable<{ status: string; models: string[] }> {
    return this.http.get<{ status: string; models: string[] }>(
      `${this.baseUrl}/health`
    );
  }

  // Trip management
  ingestTrip(trip: Trip): Observable<{ ok: boolean; trip_id: string }> {
    return this.http.post<{ ok: boolean; trip_id: string }>(
      `${this.baseUrl}/ingest_trip`,
      trip
    );
  }

  getTrip(tripId: string): Observable<Trip> {
    return this.http.get<Trip>(
      `${this.baseUrl}/trip/${encodeURIComponent(tripId)}`
    );
  }

  // Analysis endpoints
  analyzeTrip(request: AnalyzeRequest): Observable<AnalyzeTripResponse> {
    return this.http.post<AnalyzeTripResponse>(
      `${this.baseUrl}/analyze_trip`,
      request
    );
  }

  getAnalysis(tripId: string): Observable<AnalyzeTripResponse> {
    return this.http.get<AnalyzeTripResponse>(
      `${this.baseUrl}/trip/${encodeURIComponent(tripId)}/analysis`
    );
  }

  reanalyzeTrip(
    tripId: string,
    model?: string,
    deepReasoning = false
  ): Observable<AnalyzeTripResponse> {
    return this.http.post<AnalyzeTripResponse>(
      `${this.baseUrl}/reanalyze_trip`,
      {
        trip_id: tripId,
        model,
        deep_reasoning: deepReasoning,
      }
    );
  }

  // ERA/EOB utilities
  parseERAText(text: string): Observable<ERAParseResponse> {
    const formData = new FormData();
    formData.append('text', text);
    return this.http.post<ERAParseResponse>(
      `${this.baseUrl}/era/parse`,
      formData
    );
  }

  // Appeal drafting
  draftAppeal(
    tripId: string,
    notes?: string,
    model?: string
  ): Observable<AppealDraftResponse> {
    return this.http.post<AppealDraftResponse>(`${this.baseUrl}/appeal_draft`, {
      trip_id: tripId,
      notes,
      model,
    });
  }

  // Code references
  getCARCCodes(): Observable<CodesResponse> {
    return this.http.get<CodesResponse>(`${this.baseUrl}/codes/carc`);
  }

  getRARCCodes(): Observable<{
    rarc: Record<string, { title: string; play: string }>;
  }> {
    return this.http.get<{
      rarc: Record<string, { title: string; play: string }>;
    }>(`${this.baseUrl}/codes/rarc`);
  }

  // Feedback
  submitFeedback(
    tripId: string,
    rating: number,
    corrections?: string
  ): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.baseUrl}/feedback`, {
      trip_id: tripId,
      rating,
      corrections,
    });
  }

  getTripAnalysisSummary(tripId: string): Observable<TripAnalysisSummary> {
    return this.http
      .get<TripAnalysisSummary>(
        `${this.baseUrl}/trip_analysis_summary/${tripId}`
      )
      .pipe(retry(1), catchError(this.handleError));
  }

  getTripAnalysisDetails(tripId: string): Observable<TripAnalysisDetails> {
    return this.http
      .get<TripAnalysisDetails>(`${this.baseUrl}/trip_analysis/${tripId}`)
      .pipe(retry(1), catchError(this.handleError));
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unknown error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Network error: ${error.error.message}`;
    } else {
      // Server-side error
      switch (error.status) {
        case 404:
          errorMessage = 'Analysis not found for this trip';
          break;
        case 500:
          errorMessage = 'Server error occurred';
          break;
        default:
          errorMessage = `Error ${error.status}: ${error.message}`;
      }
    }

    return throwError(() => new Error(errorMessage));
  }
}
