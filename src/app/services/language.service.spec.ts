/*
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
//import { LanguageService } from './language.service';
import { FunctionsService } from './functions.service';

describe('LanguageService', () => {
//  let service: LanguageService;
  let fsSpy: jasmine.SpyObj<FunctionsService>;

  beforeEach(() => {
    fsSpy = jasmine.createSpyObj('FunctionsService', ['storeGet', 'storeSet']);
    fsSpy.storeGet.and.resolveTo('es');
    fsSpy.storeSet.and.resolveTo();

    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
 //       LanguageService,
 //       { provide: FunctionsService, useValue: fsSpy }
      ]
    });
 //   service = TestBed.inject(LanguageService);
  });

  /*
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set and get language', async () => {
    await service.setLanguage('es');
    expect(service.getCurrentLangValue()).toBe('es');
    expect(fsSpy.storeSet).toHaveBeenCalledWith('lang', 'es');
  });

});*/
