import { Global, Module } from '@nestjs/common';
import { CacheInvalidationService } from './cache-invalidation.service.js';

/** Provides DB-aware invalidation separately from the Redis-only module. */
@Global()
@Module({
  providers: [CacheInvalidationService],
  exports: [CacheInvalidationService],
})
export class CacheInvalidationModule {}
