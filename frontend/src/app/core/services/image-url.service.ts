import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export function imageServerOrigin(apiUrl: string): string {
  const parsedUrl = new URL(apiUrl);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '').replace(/\/api$/i, '');
  return `${parsedUrl.origin}${pathname}`;
}

@Injectable({ providedIn: 'root' })
export class ImageUrlService {
  private readonly apiRoot = imageServerOrigin(environment.apiUrl);

  resolve(path: string | null | undefined): string | null {
    if (!path?.trim()) return null;
    const value = path.trim();
    if (/^https?:\/\//i.test(value)) return value;
    const relativePath = value.startsWith('/') ? value : `/${value}`;
    return `${this.apiRoot}${relativePath}`;
  }

}
