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
    const digits = this.element.value.replace(/\D/g, '');
    if (this.element.value !== digits) this.renderer.setProperty(this.element, 'value', digits);
    this.onChange(digits);
  }

  @HostListener('blur')
  handleBlur(): void {
    this.onTouched();
  }

  writeValue(value: string | null): void {
    const digits = String(value ?? '').replace(/\D/g, '');
    this.renderer.setProperty(this.element, 'value', digits);
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
    const digits = String(control.value);
    const expectedLength = this.personType === 'PF' ? 11 : 14;
    if (digits.length < expectedLength) {
      return { documentIncomplete: { message: `${this.personType === 'PF' ? 'CPF' : 'CNPJ'} incompleto. Informe ${expectedLength} dígitos.` } };
    }
    if (digits.length > expectedLength) {
      return { documentInvalid: { message: `${this.personType === 'PF' ? 'CPF' : 'CNPJ'} deve conter exatamente ${expectedLength} dígitos.` } };
    }
    const message = validateDocument(this.personType, digits);
    return message ? { documentInvalid: { message } } : null;
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
