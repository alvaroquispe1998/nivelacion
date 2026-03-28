import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

interface LazyChunkRecoveryAttempt {
  url: string;
  timestamp: number;
}

const LAZY_CHUNK_RECOVERY_STORAGE_KEY = 'lazy-chunk-recovery:last-attempt';
const LAZY_CHUNK_RECOVERY_COOLDOWN_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class LazyChunkRecoveryService {
  private readonly document = inject(DOCUMENT);

  isRecoverableChunkError(error: unknown) {
    const message = this.normalizeErrorMessage(error);
    return (
      message.includes('failed to fetch dynamically imported module') ||
      message.includes('importing a module script failed') ||
      message.includes('loading chunk') ||
      message.includes('chunkloaderror')
    );
  }

  recoverFromChunkError() {
    const view = this.document.defaultView;
    if (!view || typeof sessionStorage === 'undefined') return false;

    const url = `${view.location.pathname}${view.location.search}${view.location.hash}`;
    const lastAttempt = this.readLastAttempt();
    const now = Date.now();

    if (
      lastAttempt?.url === url &&
      now - lastAttempt.timestamp < LAZY_CHUNK_RECOVERY_COOLDOWN_MS
    ) {
      return false;
    }

    sessionStorage.setItem(
      LAZY_CHUNK_RECOVERY_STORAGE_KEY,
      JSON.stringify({
        url,
        timestamp: now,
      } satisfies LazyChunkRecoveryAttempt)
    );
    view.location.replace(url);
    return true;
  }

  private normalizeErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return `${error.name} ${error.message} ${error.stack ?? ''}`.toLowerCase();
    }

    if (typeof error === 'string') {
      return error.toLowerCase();
    }

    if (!error || typeof error !== 'object') {
      return '';
    }

    const candidate = error as {
      name?: unknown;
      message?: unknown;
      type?: unknown;
      reason?: unknown;
    };

    return [
      candidate.name,
      candidate.message,
      candidate.type,
      candidate.reason,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase();
  }

  private readLastAttempt() {
    const raw = sessionStorage.getItem(LAZY_CHUNK_RECOVERY_STORAGE_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as Partial<LazyChunkRecoveryAttempt>;
      if (typeof parsed.url !== 'string' || typeof parsed.timestamp !== 'number') {
        return null;
      }
      return {
        url: parsed.url,
        timestamp: parsed.timestamp,
      } satisfies LazyChunkRecoveryAttempt;
    } catch {
      return null;
    }
  }
}
