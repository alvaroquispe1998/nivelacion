import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export type WorkflowChangeReason =
  | 'period-change'
  | 'run-applied'
  | 'schedule-saved'
  | 'teacher-saved'
  | 'classroom-saved'
  | 'matricula-generated'
  | 'generic';

export interface WorkflowChangeEvent {
  reason: WorkflowChangeReason;
  at: number;
}

@Injectable({ providedIn: 'root' })
export class WorkflowStateService {
  private readonly changedSubject = new Subject<WorkflowChangeEvent>();

  get changes$(): Observable<WorkflowChangeEvent> {
    return this.changedSubject.asObservable();
  }

  notifyWorkflowChanged(
    event?: Partial<Pick<WorkflowChangeEvent, 'reason' | 'at'>>
  ) {
    this.changedSubject.next({
      reason: event?.reason ?? 'generic',
      at: event?.at ?? Date.now(),
    });
  }
}
