// Types for the vendored qrcode-generator 2.0.4 (Kazuhiko Arase, MIT): just the parts we use.
export interface QRCode {
  addData(data: string, mode?: 'Numeric' | 'Alphanumeric' | 'Byte'): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}
export declare function qrcode(typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'): QRCode;
export default qrcode;
