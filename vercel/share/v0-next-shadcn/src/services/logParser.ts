import { LogParser as SharedLogParser, LogAnalysis, StructuredLogEvent } from '../agent/logs';

export { LogAnalysis, StructuredLogEvent };

export class LogParser {
    public static parse(rawLog: string): LogAnalysis {
        return SharedLogParser.parse(rawLog);
    }
}
