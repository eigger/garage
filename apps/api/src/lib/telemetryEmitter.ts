import { EventEmitter } from "events";

class TelemetryEmitter extends EventEmitter {}

export const telemetryEmitter = new TelemetryEmitter();
