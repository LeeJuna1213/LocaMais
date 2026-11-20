import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ImageUrlService {
  private readonly apiUrl = new URL(environment.apiUrl);
  private readonly apiRoot = this.buildApiRoot();

  resolve(path: string | null | undefined): string | null {
    if (!path?.trim()) return null;
    const value = path.trim();
    if (/^https?:\/\//i.test(value)) return value;
    const relativePath = value.startsWith('/') ? value : `/${value}`;
    return `${this.apiRoot}${relativePath}`;
  }

  private buildApiRoot(): string {
    const pathname = this.apiUrl.pathname.replace(/\/+$/, '').replace(/\/api$/i, '');
    return `${this.apiUrl.origin}${pathname}`;
  }
}
