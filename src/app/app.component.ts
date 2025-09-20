import { Component } from '@angular/core';
import { DenialUploadComponent } from './components/denial-upload/denial-upload.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  imports: [DenialUploadComponent],
  styleUrls: ['./app.component.scss'],
  standalone: true,
})
export class AppComponent {
  title = 'Medical Denial Analysis System';
}
