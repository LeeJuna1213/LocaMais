import { useInMemoryDatabase } from './helpers.js';

// Executa antes de qualquer arquivo de teste: garante que o SQLite em memória
// já esteja configurado quando o `AppModule` for importado.
useInMemoryDatabase();