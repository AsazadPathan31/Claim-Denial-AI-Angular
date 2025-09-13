import { TestBed } from '@angular/core/testing';

import { TripApiService } from './trip-api.service';

describe('TripApiService', () => {
  let service: TripApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TripApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
