import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DenialAnalysisService } from '../../services/denial-analysis.service';
import { AnalysisPopupComponent } from '../analysis-popup/analysis-popup.component';
import { DenialData, QuickAnalysisResponse } from '../../models/denials.models';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-denial-upload',
  templateUrl: './denial-upload.component.html',
  imports: [CommonModule, FormsModule, MaterialModule],
  styleUrls: ['./denial-upload.component.scss'],
  standalone: true,
})
export class DenialUploadComponent implements OnInit {
  selectedTab = 0;
  isProcessing = false;
  isDragOver = false;

  // File Upload
  selectedFile: File | null = null;
  payerName = '';

  // Paste EOB
  eobText = '';
  claimId = '';

  // Manual Entry
  manualData: Partial<DenialData> = {
    claim_id: '',
    payer: '',
    patient_name: '',
    dos: '',
    billed_amount: undefined,
    denial_codes: [],
    cpt_codes: [],
    icd_codes: [],
  };
  denialCodesInput = '';

  // Stats
  lastAnalysis: QuickAnalysisResponse | null = null;

  constructor(
    private denialService: DenialAnalysisService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.checkApiHealth();
  }

  private checkApiHealth(): void {
    this.denialService.checkHealth().subscribe({
      next: (response) => {
        console.log('API Health:', response);
      },
      error: (error) => {
        this.snackBar.open(
          'API connection failed. Please check server status.',
          'Close',
          {
            duration: 5000,
            panelClass: ['error-snackbar'],
          }
        );
      },
    });
  }

  // File Upload Methods
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.selectedFile = files[0];
    }
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  uploadFile(): void {
    if (!this.selectedFile) return;

    this.isProcessing = true;
    this.denialService
      .uploadEraFile(this.selectedFile, this.payerName)
      .subscribe({
        next: (response) => {
          if (response.extracted_denials.length > 0) {
            // Auto-analyze first denial
            const firstDenial = response.extracted_denials[0];
            this.analyzeExtractedDenial(firstDenial);
          } else {
            this.snackBar.open(
              `File processed. ${response.processing_notes.join(', ')}`,
              'Close',
              {
                duration: 5000,
              }
            );
          }
        },
        error: (error) => {
          this.isProcessing = false;
          this.snackBar.open(`Upload failed: ${error.message}`, 'Close', {
            duration: 5000,
            panelClass: ['error-snackbar'],
          });
        },
      });
  }

  // Paste EOB Methods
  analyzePastedEob(): void {
    if (!this.eobText.trim()) return;

    this.isProcessing = true;
    this.denialService
      .analyzePastedEob(this.eobText, this.claimId, this.payerName)
      .subscribe({
        next: (response) => {
          this.isProcessing = false;
          this.lastAnalysis = response;
          this.showAnalysisPopup(response);
          this.clearPasteForm();
        },
        error: (error) => {
          this.isProcessing = false;
          this.snackBar.open(`Analysis failed: ${error.message}`, 'Close', {
            duration: 5000,
            panelClass: ['error-snackbar'],
          });
        },
      });
  }

  // Manual Entry Methods
  isManualFormValid(): boolean {
    return !!(
      this.manualData.claim_id &&
      this.manualData.payer &&
      this.denialCodesInput
    );
  }

  analyzeManualEntry(): void {
    if (!this.isManualFormValid()) return;

    const denialCodes = this.denialCodesInput
      .split(',')
      .map((code) => code.trim())
      .filter((code) => code.length > 0);

    const denialData: DenialData = {
      claim_id: this.manualData.claim_id!,
      payer: this.manualData.payer!,
      patient_name: this.manualData.patient_name,
      dos: this.manualData.dos,
      billed_amount: this.manualData.billed_amount,
      denial_codes: denialCodes,
      cpt_codes: this.manualData.cpt_codes || [],
      icd_codes: this.manualData.icd_codes || [],
    };

    this.isProcessing = true;
    this.denialService.performQuickAnalysis(denialData).subscribe({
      next: (response) => {
        this.isProcessing = false;
        this.lastAnalysis = response;
        this.showAnalysisPopup(response);
        this.clearManualForm();
      },
      error: (error) => {
        this.isProcessing = false;
        this.snackBar.open(`Analysis failed: ${error.message}`, 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar'],
        });
      },
    });
  }

  private analyzeExtractedDenial(denialData: DenialData): void {
    this.denialService.performQuickAnalysis(denialData).subscribe({
      next: (response) => {
        this.lastAnalysis = response;
        this.isProcessing = false;
        this.showAnalysisPopup(response);
      },
      error: (error) => {
        this.snackBar.open(`Analysis failed: ${error.message}`, 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar'],
        });
      },
    });
  }

  showAnalysisPopup(analysisData: QuickAnalysisResponse): void {
    this.dialog.open(AnalysisPopupComponent, {
      width: '80vw',
      maxWidth: '800px',
      minWidth: '320px',
      maxHeight: '90vh',
      height: 'auto',
      data: analysisData,
      autoFocus: false,
    });
  }

  getTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diffMs = now - timestamp * 1000;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  clearManualForm(): void {
    this.manualData = {
      claim_id: '',
      payer: '',
      patient_name: '',
      dos: '',
      billed_amount: undefined,
      denial_codes: [],
      cpt_codes: [],
      icd_codes: [],
    };
    this.denialCodesInput = '';
  }

  // Add these helper methods to your component

  clearFile(): void {
    this.selectedFile = null;
    this.payerName = '';
  }

  getFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  addCode(code: string): void {
    const codes = this.denialCodesInput
      ? this.denialCodesInput.split(',').map((c) => c.trim())
      : [];
    if (!codes.includes(code)) {
      codes.push(code);
      this.denialCodesInput = codes.join(', ');
    }
  }

  clearPasteForm(): void {
    this.eobText = '';
    this.claimId = '';
    this.payerName = '';
  }

  getAppealClass(): string {
    if (!this.lastAnalysis) return '';
    return `${this.lastAnalysis.analysis.appeal_potential}-appeal`;
  }

  copyLastResults(): void {
    // Implement copy functionality
    if (this.lastAnalysis) {
      // Copy logic here
    }
  }
}
