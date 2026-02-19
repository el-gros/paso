import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { SearchGuidePopoverComponent } from './search-guide-popover.component';

describe('SearchGuidePopoverComponent', () => {
  let component: SearchGuidePopoverComponent;
  let fixture: ComponentFixture<SearchGuidePopoverComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [SearchGuidePopoverComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchGuidePopoverComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
