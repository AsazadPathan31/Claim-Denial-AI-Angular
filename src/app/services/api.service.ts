import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';
import {
  Trip,
  AnalyzeRequest,
  AnalyzeTripResponse,
  AppealDraftResponse,
  ReanalyzeRequest,
} from '../models/trip.interface';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  health(): Observable<{ status: string; models: string[] }> {
    return this.http.get<{ status: string; models: string[] }>(
      `${this.base}/health`
    );
  }

  listModels(): Observable<{ models: string[] }> {
    return this.http.get<{ models: string[] }>(`${this.base}/models`);
  }

  ingestTrip(trip: Trip): Observable<{ ok: boolean; trip_id: string }> {
    return this.http.post<{ ok: boolean; trip_id: string }>(
      `${this.base}/ingest_trip`,
      trip
    );
  }

  getTrip(id: string): Observable<Trip> {
    return this.http.get<Trip>(`${this.base}/trip/${encodeURIComponent(id)}`);
  }

  analyzeTrip(req: AnalyzeRequest): Observable<AnalyzeTripResponse> {
    return this.http.post<AnalyzeTripResponse>(
      `${this.base}/analyze_trip`,
      req
    );
  }

  getAnalysis(id: string): Observable<AnalyzeTripResponse> {
    return this.http.get<AnalyzeTripResponse>(
      `${this.base}/trip/${encodeURIComponent(id)}/analysis`
    );
  }

  reanalyzeTrip(req: ReanalyzeRequest): Observable<AnalyzeTripResponse> {
    return this.http.post<AnalyzeTripResponse>(
      `${this.base}/reanalyze_trip`,
      req
    );
  }

  codesCarc(): Observable<{
    group_codes: Record<string, string>;
    carc: Record<string, { title: string; play: string }>;
  }> {
    return this.http.get<{
      group_codes: Record<string, string>;
      carc: Record<string, { title: string; play: string }>;
    }>(`${this.base}/codes/carc`);
  }

  codesRarc(): Observable<{
    rarc: Record<string, { title: string; play: string }>;
  }> {
    return this.http.get<{
      rarc: Record<string, { title: string; play: string }>;
    }>(`${this.base}/codes/rarc`);
  }

  codesGroup(): Observable<{ group_codes: Record<string, string> }> {
    return this.http.get<{ group_codes: Record<string, string> }>(
      `${this.base}/codes/group`
    );
  }

  eraParseText(text: string): Observable<{
    carc: string[];
    rarc: string[];
    groups: string[];
    count: Record<string, number>;
  }> {
    const form = new FormData();
    form.append('text', text);
    return this.http.post<{
      carc: string[];
      rarc: string[];
      groups: string[];
      count: Record<string, number>;
    }>(`${this.base}/era/parse`, form);
  }

  appealDraft(
    trip_id: string,
    notes?: string,
    model?: string
  ): Observable<AppealDraftResponse> {
    return this.http.post<AppealDraftResponse>(`${this.base}/appeal_draft`, {
      trip_id,
      notes,
      model,
    });
  }

  feedback(
    trip_id: string,
    rating: number,
    corrections?: string
  ): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/feedback`, {
      trip_id,
      rating,
      corrections,
    });
  }
}
