import { wrap, Remote, releaseProxy } from "comlink";
import type { CompilerWorker } from "./worker";
import type { CanonicalIR } from "@zero-dollar/ir-core";

export class ResilientWorkerManager {
  private worker!: Worker;
  private proxy!: Remote<CompilerWorker>;
  private compileVersion: number = 0;
  
  // Per-job registry tracks all overlapping in-flight promises
  private pendingJobs: Map<number, (err: Error) => void> = new Map();

  constructor() {
    this.spawnWorker();
  }

  private spawnWorker() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.proxy = wrap<CompilerWorker>(this.worker);
    this.worker.onerror = (error) => this.handleWorkerCrash(error);
  }

  private handleWorkerCrash(error: ErrorEvent) {
    console.error("[Supervisor] Compiler Worker crashed:", error);
    this.terminate();
    
    // Reject ALL overlapping jobs cleanly to prevent memory leaks/hanging UI
    this.pendingJobs.forEach((rejectJob, jobId) => {
      rejectJob(new Error("Compiler worker crashed unexpectedly."));
    });

    this.pendingJobs.clear();
    
    // Invalidate current version string
    this.compileVersion++;
    
    console.log("[Supervisor] Re-spawning fresh worker thread...");
    this.spawnWorker();
  }

  public async compileWithTimeout(irPayload: CanonicalIR, timeoutMs = 8000): Promise<Record<string, string>> {
    const jobId = ++this.compileVersion;

    return new Promise((resolve, reject) => {
      // Register this specific job
      this.pendingJobs.set(jobId, reject);

      const timer = setTimeout(() => {
        // If this job is still pending, the worker has hung
        if (this.pendingJobs.has(jobId)) {
          console.warn(`[Supervisor] Worker compilation exceeded ${timeoutMs}ms timeout.`);
          this.terminate();
          this.spawnWorker();
          
          this.compileVersion++; 
          
          // Reject all jobs caught in the crossfire of the worker termination
          for (const [id, rejectJob] of this.pendingJobs.entries()) {
            if (id === jobId) {
              rejectJob(new Error("Compilation timed out. Please simplify complex circular dependencies."));
            } else {
              rejectJob(new Error("Compilation terminated due to a timeout in a preceding job."));
            }
          }
          this.pendingJobs.clear();
        }
      }, timeoutMs);

      this.proxy.compileIRToCode(irPayload).then((res) => {
        clearTimeout(timer);
        if (this.pendingJobs.has(jobId)) {
          this.pendingJobs.delete(jobId);
          if (this.compileVersion === jobId) {
            resolve(res); // Latest request wins
          } else {
            reject(new Error("Compilation superseded by newer request."));
          }
        }
      }).catch((err) => {
        clearTimeout(timer);
        if (this.pendingJobs.has(jobId)) {
          this.pendingJobs.delete(jobId);
          if (this.compileVersion === jobId) {
            reject(err);
          } else {
            reject(new Error("Compilation superseded by newer request."));
          }
        }
      });
    });
  }

  public terminate() {
    if (this.proxy) {
      this.proxy[releaseProxy]();
    }
    if (this.worker) {
      this.worker.terminate();
    }
  }
}