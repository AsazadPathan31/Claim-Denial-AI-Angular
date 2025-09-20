import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import {
  Trip,
  AnalyzeRequest,
  AnalyzeTripResponse,
  AppealDraftResponse,
  ERAParseResponse,
} from '../models/trip.interface';

@Injectable({ providedIn: 'root' })
export class TripApiService {
  private baseUrl = environment.apiBaseUrl;
  constructor(private http: HttpClient) {}

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
}
