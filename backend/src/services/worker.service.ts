import { workerRepository } from '../repositories/worker.repository.js';
import { WorkerInstance, WorkerQueueSummary } from '../models/worker.types.js';

export class WorkerService {
  async getWorkers(): Promise<WorkerInstance[]> {
    return workerRepository.listWorkers();
  }

  async getQueues(): Promise<WorkerQueueSummary[]> {
    return workerRepository.getQueueSummaries();
  }

  async recordHeartbeat(workerId: string, data: {
    status?: string;
    concurrency?: number;
    currentJobs?: any[];
    completedJobsCount?: number;
    failedJobsCount?: number;
    uptimeSeconds?: number;
  }): Promise<void> {
    await workerRepository.recordHeartbeat(workerId, data);
  }
}

export const workerService = new WorkerService();
