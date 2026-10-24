import { Failure } from "@/domain/failure";

export class InvalidPage extends Failure("InvalidPage", "bad_request", "Invalid page parameter") {}
