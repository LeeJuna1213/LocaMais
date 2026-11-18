import { Injectable } from '@angular/core';

const TOKEN_KEY = 'locamais.access_token';

/** Único ponto de acesso ao armazenamento; substituível por armazenamento nativo. */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  get(): string | null {
    try { return globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? null; } catch { return null; }
  }
  set(token: string): void {
    try { globalThis.sessionStorage?.setItem(TOKEN_KEY, token); } catch { /* storage may be unavailable */ }
  }
  clear(): void {
    try { globalThis.sessionStorage?.removeItem(TOKEN_KEY); } catch { /* storage may be unavailable */ }
  }
}
