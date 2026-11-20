import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { normalizeDocument, validateDocument } from '../../core/utils/document.validation';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { RegisterPage } from './register.page';

describe('RegisterPage complete registration form', () => {
  const auth = { loading: () => false, register: vi.fn() };
  const toast = { show: vi.fn(async () => undefined) };
  const router = { navigateByUrl: vi.fn(async () => true) };
  let fixture: ComponentFixture<RegisterPage>;
  let page: RegisterPage;

  beforeEach(async () => {
    auth.register.mockReset().mockResolvedValue(undefined);
    toast.show.mockClear();
    router.navigateByUrl.mockClear();
    TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: router },
      ],
    });
    TestBed.overrideComponent(RegisterPage, {
      remove: { imports: [AppShellComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(RegisterPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function input(name: string): HTMLInputElement {
    const element = fixture.nativeElement.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
    if (!element) throw new Error(`Campo ${name} não encontrado no formulário`);
    return element;
  }

  async function fill(name: string, value: string): Promise<void> {
    const element = input(name);
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function typeInto(name: string, value: string): Promise<void> {
    const element = input(name);
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function pasteInto(name: string, value: string): Promise<void> {
    const element = input(name);
    element.dispatchEvent(new Event('paste', { bubbles: true, cancelable: true }));
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function fillCommonFields(): Promise<void> {
    await fill('name', 'Maria Teste');
    await fill('email', 'maria@example.test');
    await fill('street', 'Rua das Flores');
    await fill('number', '123');
    await fill('district', 'Centro');
    await fill('city', 'São Paulo');
    await fill('state', 'SP');
    await fill('zipCode', '01001-000');
    await fill('password', 'SenhaTeste1');
    await fill('passwordConfirmation', 'SenhaTeste1');
  }

  async function submit(): Promise<void> {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function button(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  function selectType(label: string): void {
    const tab = [...fixture.nativeElement.querySelectorAll('app-segment-tabs button')]
      .find((element) => element.textContent?.trim() === label) as HTMLButtonElement | undefined;
    if (!tab) throw new Error(`Opção ${label} não encontrada`);
    tab.click();
    fixture.detectChanges();
  }

  it.each([
    ['PF', '529.982.247-25', 'cpf', '52998224725'],
    ['PF', '52998224725', 'cpf', '52998224725'],
    ['PJ', '11.222.333/0001-81', 'cnpj', '11222333000181'],
    ['PJ', '11222333000181', 'cnpj', '11222333000181'],
  ] as const)('torna formulário %s válido e submete documento %s normalizado', async (type, document, key, normalized) => {
    await fillCommonFields();
    if (type === 'PF') {
      await fill('document', document);
      await fill('birthDate', '1990-05-10');
    } else {
      selectType('Pessoa Jurídica');
      await fill('document', document);
      await fill('companyName', 'Empresa Exemplo Ltda');
    }

    const expectedDisplay = type === 'PF' ? '529.982.247-25' : '11.222.333/0001-81';
    expect(input('document').value).toBe(expectedDisplay);
    expect(page.document).toBe(expectedDisplay);
    expect(normalizeDocument(page.document)).toBe(normalized);
    expect(validateDocument(type, page.document)).toBeNull();
    expect(page.registrationForm?.controls['document'].errors).toBeNull();
    expect(page.registrationForm?.controls['document'].valid).toBe(true);
    expect(page.registrationForm?.valid).toBe(true);
    expect(button().disabled).toBe(false);
    await submit();

    expect(auth.register).toHaveBeenCalledTimes(1);
    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ type, [key]: normalized }));
    expect(router.navigateByUrl).toHaveBeenCalledWith('/client/veiculos');
  });

  it('mantém PF inválido para CPF com dígito verificador incorreto e explica o campo', async () => {
    await fillCommonFields();
    await fill('document', '529.982.247-24');
    await fill('birthDate', '1990-05-10');

    expect(page.registrationForm?.valid).toBe(false);
    expect(button().disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('CPF inválido. Confira os 11 dígitos e os dígitos verificadores.');
    await submit();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('mantém PJ inválido para CNPJ incorreto e explica o campo', async () => {
    selectType('Pessoa Jurídica');
    await fillCommonFields();
    await fill('document', '11.222.333/0001-80');
    await fill('companyName', 'Empresa Exemplo Ltda');

    expect(page.registrationForm?.valid).toBe(false);
    expect(button().disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('CNPJ inválido. Confira os 14 dígitos e os dígitos verificadores.');
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('saneia CPF digitado, atualiza o valor do controle Angular e sinaliza dez dígitos como incompleto', async () => {
    await typeInto('document', '5299822472');
    expect(input('document').value).toBe('529.982.247-2');
    expect(page.document).toBe('529.982.247-2');
    expect(page.registrationForm?.controls['document'].value).toBe('529.982.247-2');
    expect(page.registrationForm?.controls['document'].errors?.['documentIncomplete']).toBeTruthy();
    expect(page.registrationForm?.invalid).toBe(true);

    await typeInto('document', '5299822472a');
    expect(input('document').value).toBe('529.982.247-2');
    expect(page.document).toBe('529.982.247-2');
  });

  it('remove letras e pontuação de CPF colado e valida os 11 dígitos resultantes', async () => {
    await pasteInto('document', 'CPF: 529.982.247-25 abc');
    expect(input('document').value).toBe('529.982.247-25');
    expect(page.document).toBe('529.982.247-25');
    expect(page.registrationForm?.controls['document'].valid).toBe(true);
  });

  it('distingue CPF com 11 dígitos inválidos do CPF válido', async () => {
    await fill('document', '11111111111');
    expect(page.registrationForm?.controls['document'].errors?.['documentInvalid']).toBeTruthy();
    await fill('document', '52998224725');
    expect(page.registrationForm?.controls['document'].valid).toBe(true);
  });

  it('limita CPF a 11 dígitos ao digitar ou colar e trata campo apagado como obrigatório', async () => {
    await typeInto('document', '529982247251234');
    expect(input('document').value).toBe('529.982.247-25');
    expect(page.document).toBe('529.982.247-25');
    expect(page.registrationForm?.controls['document'].valid).toBe(true);

    await pasteInto('document', '529982247251234');
    expect(input('document').value).toBe('529.982.247-25');
    expect(page.document).toBe('529.982.247-25');

    await fill('document', '');
    expect(page.registrationForm?.controls['document'].errors?.['required']).toBeTruthy();
  });

  it('saneia CNPJ digitado e colado, distingue incompleto e inválido', async () => {
    selectType('Pessoa Jurídica');
    await typeInto('document', '1122233300018a');
    expect(input('document').value).toBe('11.222.333/0001-8');
    expect(page.document).toBe('11.222.333/0001-8');
    expect(page.registrationForm?.controls['document'].errors?.['documentIncomplete']).toBeTruthy();

    await pasteInto('document', 'CNPJ 11.222.333/0001-80 letras');
    expect(input('document').value).toBe('11.222.333/0001-80');
    expect(page.document).toBe('11.222.333/0001-80');
    expect(page.registrationForm?.controls['document'].errors?.['documentInvalid']).toBeTruthy();

    await pasteInto('document', '11.222.333/0001-81');
    expect(input('document').value).toBe('11.222.333/0001-81');
    expect(page.document).toBe('11.222.333/0001-81');
    expect(page.registrationForm?.controls['document'].valid).toBe(true);
  });

  it('limita CNPJ a 14 dígitos e reconhece campo apagado como obrigatório', async () => {
    selectType('Pessoa Jurídica');
    await typeInto('document', '112223330001811234');
    expect(input('document').value).toBe('11.222.333/0001-81');
    expect(page.document).toBe('11.222.333/0001-81');
    expect(page.registrationForm?.controls['document'].valid).toBe(true);

    await pasteInto('document', '112223330001811234');
    expect(input('document').value).toBe('11.222.333/0001-81');
    await fill('document', '');
    expect(page.registrationForm?.controls['document'].errors?.['required']).toBeTruthy();
  });

  it('não submete o formulário com documento incompleto', async () => {
    await fillCommonFields();
    await fill('document', '5299822472');
    await fill('birthDate', '1990-05-10');

    expect(button().disabled).toBe(true);
    expect(page.registrationForm?.controls['document'].errors?.['documentIncomplete']).toBeTruthy();
    await submit();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('desabilita submissão quando falta endereço obrigatório e mostra qual campo falta', async () => {
    await fill('name', 'Maria Teste');
    await fill('email', 'maria@example.test');
    await fill('document', '52998224725');
    await fill('birthDate', '1990-05-10');
    await fill('password', 'SenhaTeste1');
    await fill('passwordConfirmation', 'SenhaTeste1');
    await fill('street', 'Rua das Flores');
    await fill('number', '123');
    await fill('district', 'Centro');
    await fill('city', 'São Paulo');
    await fill('state', 'SP');

    expect(page.registrationForm?.invalid).toBe(true);
    expect(button().disabled).toBe(true);
    page.registrationForm?.control.markAllAsTouched();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Informe um CEP com 8 dígitos, com ou sem hífen.');
  });

  it('atualiza controles obrigatórios e validador do documento ao alternar PF/PJ/PF', async () => {
    await fillCommonFields();
    await fill('document', '529.982.247-25');
    await fill('birthDate', '1990-05-10');
    expect(page.registrationForm?.valid).toBe(true);

    selectType('Pessoa Jurídica');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(page.registrationForm?.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('input[name="birthDate"]')).toBeNull();
    await fill('document', '11.222.333/0001-81');
    await fill('companyName', 'Empresa Exemplo Ltda');
    expect(page.registrationForm?.valid).toBe(true);

    selectType('Pessoa Física');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(page.registrationForm?.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('input[name="companyName"]')).toBeNull();
    await fill('document', '52998224725');
    await fill('birthDate', '1990-05-10');
    expect(page.registrationForm?.valid).toBe(true);
  });
});
