declare module "qrcode" {
  export function toString(...args: any[]): Promise<string>;
  export function toBuffer(...args: any[]): Promise<Buffer>;
  export function toDataURL(...args: any[]): Promise<string>;

  const QRCode: {
    toString: typeof toString;
    toBuffer: typeof toBuffer;
    toDataURL: typeof toDataURL;
  };

  export default QRCode;
}

declare module "bwip-js" {
  const bwipjs: any;
  export default bwipjs;
}
