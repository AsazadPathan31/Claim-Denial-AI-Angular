import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { QuickAnalysisResponse } from '../../models/denials.models';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';

@Component({
  selector: 'app-analysis-popup',
  templateUrl: './analysis-popup.component.html',
  imports: [CommonModule, MaterialModule],
  styleUrls: ['./analysis-popup.component.scss'],
  standalone: true,
})
export class AnalysisPopupComponent {
  constructor(
    public dialogRef: MatDialogRef<AnalysisPopupComponent>,
    @Inject(MAT_DIALOG_DATA) public data: QuickAnalysisResponse,
    private snackBar: MatSnackBar
  ) {}

  getAppealClass(): string {
    return `${this.data.analysis.appeal_potential}-appeal`;
  }

  getBillingClass(): string {
    const action = this.data.analysis.billing_action.replace('_', '');
    return `${action}-action`;
  }

  getBillingText(): string {
    const actions: Record<string, string> = {
      rebill: 'Rebill Claim',
      appeal: 'File Appeal',
      write_off: 'Write Off',
      patient_bill: 'Bill Patient',
    };
    return (
      actions[this.data.analysis.billing_action] ||
      this.data.analysis.billing_action
    );
  }

  copyResults(): void {
    const resultsText = `
DENIAL ANALYSIS RESULTS
======================
Claim ID: ${this.data.claim_id}
Denial Codes: ${this.data.codes_analyzed.join(', ')}

ROOT CAUSE:
${this.data.analysis.root_cause}

ACTION REQUIRED:
${this.data.analysis.action_required}

APPEAL POTENTIAL: ${this.data.analysis.appeal_potential.toUpperCase()}
BILLING ACTION: ${this.getBillingText()}

Generated: ${new Date(this.data.timestamp * 1000).toLocaleString()}
    `.trim();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(resultsText)
        .then(() => {
          this.snackBar.open('Results copied to clipboard!', 'Close', {
            duration: 3000,
            horizontalPosition: 'center',
            verticalPosition: 'bottom',
          });
        })
        .catch(() => {
          this.fallbackCopy(resultsText);
        });
    } else {
      this.fallbackCopy(resultsText);
    }
  }

  private fallbackCopy(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
      this.snackBar.open('Results copied to clipboard!', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      });
    } catch (err) {
      this.snackBar.open('Failed to copy results', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      });
    } finally {
      document.body.removeChild(textArea);
    }
  }
}
