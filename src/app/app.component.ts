import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TripApiService } from './services/trip-api.service';
import { AnalysisPopupComponent } from './components/analysis-popup/analysis-popup.component';
import {
  Trip,
  AnalysisResult,
  AnalyzeTripResponse,
} from './models/trip.interface';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, AnalysisPopupComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  constructor(private readonly apiService: TripApiService) {}

  apiStatus = signal<{ status: string; models: string[] } | null>(null);
  isLoading = signal(false);
  showAnalysisPopup = signal(false);
  currentAnalysis = signal<AnalysisResult | null>(null);
  currentTripId = signal<string | null>(null);
  extractedCodes = signal<{ carc: string[]; rarc: string[] }>({
    carc: [],
    rarc: [],
  });

  tripForm: Trip = {
    trip_id: '',
    payer: '',
    claim_id: '',
    eob_text: '',
    denial_codes: [],
    comments: '',
    dos: '',
    pos: '',
    cpt_hcpcs: [],
    icd10: [],
  };
  denialCodesInput = '';
  cptCodesInput = '';
  icdCodesInput = '';
  eobText = '';

  ngOnInit() {
    this.checkAPIHealth();
  }

  checkAPIHealth() {
    this.apiService.checkHealth().subscribe({
      next: (status) => this.apiStatus.set(status),
      error: () => this.apiStatus.set({ status: 'error', models: [] }),
    });
  }

  private parseCommaSeparatedInput(input: string): string[] {
    return input
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private updateTripFormArrays() {
    this.tripForm.denial_codes = this.parseCommaSeparatedInput(
      this.denialCodesInput
    );
    this.tripForm.cpt_hcpcs = this.parseCommaSeparatedInput(this.cptCodesInput);
    this.tripForm.icd10 = this.parseCommaSeparatedInput(this.icdCodesInput);
  }

  analyzeTrip() {
    if (!this.tripForm.trip_id.trim() || !this.tripForm.payer.trim()) {
      alert('Please provide Trip ID and Payer');
      return;
    }

    this.updateTripFormArrays();
    this.isLoading.set(true);

    this.apiService.ingestTrip(this.tripForm).subscribe({
      next: () => {
        const analyzeRequest = {
          trip: this.tripForm,
          deep_reasoning: false,
        };

        this.apiService.analyzeTrip(analyzeRequest).subscribe({
          next: (response: AnalyzeTripResponse) => {
            this.currentTripId.set(response.trip_id);
            this.currentAnalysis.set(response.analysis);
            this.isLoading.set(false);
            this.showAnalysisPopup.set(true);
          },
          error: (error) => {
            console.error('Analysis failed:', error);
            this.isLoading.set(false);
            alert(
              'Failed to analyze trip. Please check the API connection and try again.'
            );
          },
        });
      },
      error: (error) => {
        console.error('Trip ingestion failed:', error);
        this.isLoading.set(false);
        alert(
          'Failed to save trip. Please check the API connection and try again.'
        );
      },
    });
  }

  parseEOBText() {
    if (!this.eobText.trim()) {
      alert('Please enter EOB/ERA text to parse');
      return;
    }

    this.isLoading.set(true);
    this.apiService.parseERAText(this.eobText).subscribe({
      next: (response) => {
        this.extractedCodes.set({
          carc: response.carc,
          rarc: response.rarc,
        });
        if (!this.denialCodesInput.trim()) {
          const allCodes = [...response.carc, ...response.rarc];
          this.denialCodesInput = allCodes.join(', ');
        }
        this.tripForm.eob_text = this.eobText;

        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('EOB parsing failed:', error);
        this.isLoading.set(false);
        alert('Failed to parse EOB text. Please try again.');
      },
    });
  }

  onReanalyze(deepReasoning: boolean) {
    const tripId = this.currentTripId();
    if (!tripId) return;

    this.isLoading.set(true);
    this.apiService.reanalyzeTrip(tripId, undefined, deepReasoning).subscribe({
      next: (response) => {
        this.currentAnalysis.set(response.analysis);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Reanalysis failed:', error);
        this.isLoading.set(false);
      },
    });
  }

  clearForm() {
    this.tripForm = {
      trip_id: '',
      payer: '',
      claim_id: '',
      eob_text: '',
      denial_codes: [],
      comments: '',
      dos: '',
      pos: '',
      cpt_hcpcs: [],
      icd10: [],
    };
    this.denialCodesInput = '';
    this.cptCodesInput = '';
    this.icdCodesInput = '';
    this.eobText = '';
    this.extractedCodes.set({ carc: [], rarc: [] });
  }

  generateSampleTripId(): string {
    return `TRIP-${Date.now().toString().slice(-6)}`;
  }

  fillSampleData() {
    this.tripForm.trip_id = this.generateSampleTripId();
    this.tripForm.payer = 'Acme Health Insurance';
    this.tripForm.claim_id =
      'CLM-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    this.denialCodesInput = 'CO-50, N115';
    this.cptCodesInput = '99213, 99024';
    this.icdCodesInput = 'M25.551, M79.3';
    this.tripForm.dos = '2025-08-15';
    this.tripForm.comments = 'Patient reported knee pain, initial consultation';
  }
}
