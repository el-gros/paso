import { TestBed } from '@angular/core/testing';
import { FunctionsService } from './functions.service';

describe('FunctionsService', () => {
  let service: FunctionsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FunctionsService,
        {
          provide: Storage,
          useValue: {
            get: jasmine.createSpy().and.returnValue(Promise.resolve('en')),
            set: jasmine.createSpy().and.returnValue(Promise.resolve()),
            create: jasmine.createSpy().and.returnValue(Promise.resolve()),
          }
        }
      ]
    });

    service = TestBed.inject(FunctionsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // Add more tests here for storeGet/storeSet/etc.
});
