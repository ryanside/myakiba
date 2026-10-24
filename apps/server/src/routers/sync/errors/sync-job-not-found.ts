import { Failure } from "@/domain/failure";

export class SyncJobNotFound extends Failure("SyncJobNotFound", "not_found", "Job not found") {}
