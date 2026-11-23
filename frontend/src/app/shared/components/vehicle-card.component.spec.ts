import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ImageUrlService } from '../../core/services/image-url.service';
import { VehicleCardComponent } from './vehicle-card.component';

describe('VehicleCardComponent inspection badge visibility', () => {
  let fixture: ComponentFixture<VehicleCardComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [VehicleCardComponent], providers: [
      { provide: ImageUrlService, useValue: { resolve: () => null } },
    ] });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(VehicleCardComponent);
    fixture.componentInstance.vehicle = {
      id: 1, name: 'Carro Teste 2026', version: '', pricePerDay: 100, status: 'Disponível',
      color: '#000', category: 'Teste', transmission: null, revisions: [], favorite: false,
      inspectionDue: true,
    };
  });

  it('shows pending inspection only in administrative cards', () => {
    fixture.componentInstance.adminActions = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Vistoria pendente');

    const clientFixture = TestBed.createComponent(VehicleCardComponent);
    clientFixture.componentInstance.vehicle = fixture.componentInstance.vehicle;
    clientFixture.componentRef.setInput('adminActions', false);
    clientFixture.detectChanges();
    expect(clientFixture.nativeElement.textContent).not.toContain('Vistoria pendente');
  });
});
