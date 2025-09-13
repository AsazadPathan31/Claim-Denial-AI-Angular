import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalysisResult } from '../../models/trip.interface';
import { TripApiService } from '../../services/trip-api.service';

@Component({
  selector: 'app-analysis-popup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analysis-popup.component.html',
  styleUrls: ['./analysis-popup.component.scss'],
})
export class AnalysisPopupComponent implements OnInit {
  @Input() analysis: AnalysisResult | null = null;
  @Input() tripId: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() reanalyze = new EventEmitter<boolean>();
  @Output() draftAppeal = new EventEmitter<void>();

  private apiService = inject(TripApiService);

  appealText = signal<string>('');
  isLoadingAppeal = signal(false);
  feedbackRating = 0;

  ngOnInit() {
    // Component initialization
  }

  onClose() {
    this.close.emit();
  }

  onReanalyze(deepReasoning = false) {
    this.reanalyze.emit(deepReasoning);
  }

  onDraftAppeal() {
    if (!this.tripId) return;

    this.isLoadingAppeal.set(true);
    this.apiService.draftAppeal(this.tripId).subscribe({
      next: (response) => {
        this.appealText.set(response.appeal_or_checklist);
        this.isLoadingAppeal.set(false);
      },
      error: () => {
        this.isLoadingAppeal.set(false);
      },
    });
  }

  copyAppealText() {
    const text = this.appealText();
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        // Could add a toast notification here
      });
    }
  }

  submitFeedback(rating: number) {
    if (!this.tripId) return;

    this.feedbackRating = rating;
    this.apiService
      .submitFeedback(this.tripId, rating, 'UI feedback')
      .subscribe();
  }

  getRiskClass(): string {
    const risk = this.analysis?.risk?.toLowerCase();
    return `risk-${risk || 'unknown'}`;
  }
}
