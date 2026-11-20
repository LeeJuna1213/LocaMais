import { Directive, ElementRef, forwardRef, HostListener, Input, Renderer2 } from '@angular/core';
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
  private onValidatorChange?: () => void;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(elementRef: ElementRef<HTMLInputElement>, private readonly renderer: Renderer2) {
    this.element = elementRef.nativeElement;
  }

  @Input() set appDocumentInput(value: ClientType) {
    if (value !== this.personType) {
      this.personType = value;
      this.onValidatorChange?.();
    }
  }

  @HostListener('input')
  handleInput(): void {
    const formatted = this.format(this.digits(this.element.value));
    if (this.element.value !== formatted) this.renderer.setProperty(this.element, 'value', formatted);
    this.onChange(formatted);
  }

  @HostListener('blur')
  handleBlur(): void {
    this.onTouched();
  }

  writeValue(value: string | null): void {
    this.renderer.setProperty(this.element, 'value', this.format(this.digits(String(value ?? ''))));
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
