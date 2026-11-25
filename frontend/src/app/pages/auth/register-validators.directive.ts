import { Directive, ElementRef, forwardRef, HostListener, inject, Input, Renderer2 } from '@angular/core';
import { AbstractControl, ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';

import { ClientType } from '../../core/models';
import { validateDocument } from '../../core/utils/document.validation';

@Directive({
  selector: '[appDocumentInput]',
  standalone: true,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DocumentInputDirective), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DocumentInputDirective), multi: true },
  ],
})
export class DocumentInputDirective implements ControlValueAccessor, Validator {
  private readonly element: HTMLInputElement;
  private personType: ClientType = 'PF';
  private lastAcceptedValue = '';
  private onValidatorChange?: () => void;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  private readonly renderer = inject(Renderer2);

  constructor() {
    this.element = inject(ElementRef<HTMLInputElement>).nativeElement;
  }

  @Input() set appDocumentInput(value: ClientType) {
    if (value !== this.personType) {
      this.personType = value;
      this.onValidatorChange?.();
    }
  }

  @HostListener('input')
  handleInput(): void {
    const raw = this.element.value;
    const caret = this.element.selectionStart ?? raw.length;
    const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, '').length;
    const digits = raw.replace(/\D/g, '');
    const maxDigits = this.personType === 'PF' ? 11 : 14;
    const formattedDigits = this.format(digits);
    const containsOnlyDocumentCharacters = /^[\d./-]*$/.test(raw);
    if (!containsOnlyDocumentCharacters || digits.length > maxDigits) {
      this.renderer.setProperty(this.element, 'value', this.lastAcceptedValue);
      this.setCaret(this.lastAcceptedValue.length);
      return;
    }
    const formatted = formattedDigits;
    if (this.element.value !== formatted) this.renderer.setProperty(this.element, 'value', formatted);
    this.lastAcceptedValue = formatted;
    this.onChange(formatted);
    this.setCaret(this.positionAfterDigits(formatted, digitsBeforeCaret));
  }

  @HostListener('blur')
  handleBlur(): void {
    this.onTouched();
  }

  writeValue(value: string | null): void {
    const formatted = this.format(this.digits(String(value ?? '')));
    this.lastAcceptedValue = formatted;
    this.renderer.setProperty(this.element, 'value', formatted);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.renderer.setProperty(this.element, 'disabled', disabled);
  }

  validate(control: AbstractControl): ValidationErrors | null {
    if (!control.value) return null;
    const digits = this.digits(String(control.value));
    const expectedLength = this.personType === 'PF' ? 11 : 14;
    if (digits.length < expectedLength) {
      return { documentIncomplete: { message: `${this.personType === 'PF' ? 'CPF' : 'CNPJ'} incompleto. Informe ${expectedLength} dígitos.` } };
    }
    if (digits.length > expectedLength) {
      return { documentInvalid: { message: `${this.personType === 'PF' ? 'CPF' : 'CNPJ'} deve conter exatamente ${expectedLength} dígitos.` } };
    }
    const message = validateDocument(this.personType, String(control.value));
    return message ? { documentInvalid: { message } } : null;
  }

  private digits(value: string): string {
    const maxDigits = this.personType === 'PF' ? 11 : 14;
    return value.replace(/\D/g, '').slice(0, maxDigits);
  }

  private format(value: string): string {
    if (this.personType === 'PF') {
      const first = value.slice(0, 3);
      const second = value.slice(3, 6);
      const third = value.slice(6, 9);
      const last = value.slice(9, 11);
      return `${first}${second ? `.${second}` : ''}${third ? `.${third}` : ''}${last ? `-${last}` : ''}`;
    }

    const first = value.slice(0, 2);
    const second = value.slice(2, 5);
    const third = value.slice(5, 8);
    const fourth = value.slice(8, 12);
    const last = value.slice(12, 14);
    return `${first}${second ? `.${second}` : ''}${third ? `.${third}` : ''}${fourth ? `/${fourth}` : ''}${last ? `-${last}` : ''}`;
  }

  private positionAfterDigits(formatted: string, digitCount: number): number {
    if (digitCount <= 0) return 0;
    let seen = 0;
    for (let index = 0; index < formatted.length; index += 1) {
      if (/\d/.test(formatted[index])) seen += 1;
      if (seen === digitCount) return index + 1;
    }
    return formatted.length;
  }

  private setCaret(position: number): void {
    if (document.activeElement === this.element) {
      this.element.setSelectionRange(position, position);
    }
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }
}

@Directive({
  selector: '[appMatchValue]',
  standalone: true,
  providers: [{ provide: NG_VALIDATORS, useExisting: forwardRef(() => MatchValueValidatorDirective), multi: true }],
})
export class MatchValueValidatorDirective implements Validator {
  private expectedValue = '';
  private onValidatorChange?: () => void;

  @Input() set appMatchValue(value: string) {
    if (value !== this.expectedValue) {
      this.expectedValue = value ?? '';
      this.onValidatorChange?.();
    }
  }

  validate(control: AbstractControl): ValidationErrors | null {
    return !control.value || control.value === this.expectedValue ? null : { valueMismatch: true };
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }
}
