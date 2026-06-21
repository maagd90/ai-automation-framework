import { EPHEMERAL_SESSIONS } from '../config';
import { InMemoryJobStore } from './InMemoryJobStore';
import { PersistentJobStore } from './PersistentJobStore';

export type JobStoreApi = InMemoryJobStore | PersistentJobStore;

export const jobStore: JobStoreApi = EPHEMERAL_SESSIONS
  ? new InMemoryJobStore()
  : new PersistentJobStore();
