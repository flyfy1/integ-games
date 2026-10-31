/** The slice of WebHID the gamepad kit uses; TypeScript's DOM lib does not include it yet. */
interface HIDInputReportEvent extends Event { readonly device: HIDDevice; readonly reportId: number; readonly data: DataView }
interface HIDConnectionEvent extends Event { readonly device: HIDDevice }
interface HIDDevice extends EventTarget {
  readonly opened: boolean; readonly vendorId: number; readonly productId: number; readonly productName: string;
  open(): Promise<void>; close(): Promise<void>;
}
interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: { filters: Array<{ vendorId?: number; productId?: number }> }): Promise<HIDDevice[]>;
}
interface Navigator { readonly hid?: HID }
