export interface NetworkEvents {
  [eventName: string]: (...args: any[]) => any;
}

export interface MonorepoMessage {
  /** UUIDv4 ID issues for this message */
  messageId: string;
  /** Type of the message, indicating its purpose or response status */
  type: "emit" | "request" | "success_response" | "error_response";
  /** Name of the logical side, which created this message */
  from: string;
  /** Name of the event */
  eventName: string;
  /** Arguments of the event */
  payload: any[];
}
