import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WorkflowStateService {
  private readonly changedSubject = new Subject<void>();

  get changes$(): Observable<void> {
    return this.changedSubject.asObservable();
  }

  notifyWorkflowChanged() {
    this.changedSubject.next();
  }
}
