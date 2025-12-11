import KJUR from "jsrsasign";
import { Canvas, FabricText } from "fabric";

// You should sign your JWT with a backend service in a production use-case
export function generateSignature(sessionName: string, role: number, sdkKey: string, sdkSecret: string) {
  const iat = Math.round(new Date().getTime() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;
  const oHeader = { alg: "HS256", typ: "JWT" };

  const oPayload = {
    app_key: sdkKey,
    tpc: sessionName,
    role_type: role,
    version: 1,
    iat: iat,
    exp: exp,
  };

  const sHeader = JSON.stringify(oHeader);
  const sPayload = JSON.stringify(oPayload);
  const sdkJWT = KJUR.KJUR.jws.JWS.sign("HS256", sHeader, sPayload, sdkSecret);
  return sdkJWT;
}

export async function getBitmap(message: string, w: number, h: number) {
  let width = w;
  let height = h;
  if (w === 0) width = 1920;
  if (h === 0) height = 1080;
  const padding = (height * 0.025);
  const strokeWidth = Math.round(height * 0.01);
  const canvas = new Canvas(document.createElement("canvas"), { width, height });

  // Estimate max line width in characters based on canvas width and font size
  // This is a rough estimate; for more accuracy, measure text width with a canvas context
  const fontSize = Math.round(height * 0.05);
  const avgCharWidth = fontSize * 0.6; // average width of a character in px for sans-serif
  const maxLineWidthPx = width - (padding * 2);
  const maxCharsPerLine = Math.floor(maxLineWidthPx / avgCharWidth);

  // Split message into lines that fit within maxCharsPerLine, breaking at spaces
  function wrapText(text: string, maxChars: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      if ((currentLine + (currentLine ? ' ' : '') + word).length <= maxChars) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  const lines = wrapText(message, maxCharsPerLine);
  // Calculate vertical positioning for all lines so they appear above the bottom padding
  const totalTextHeight = lines.length * fontSize + (lines.length - 1) * (fontSize * 0.2);
  let startY = height - padding - totalTextHeight;

  lines.forEach((line, i) => {
    const textObj = new FabricText(line, {
      textAlign: 'center',
      fontFamily: 'sans-serif',
      fill: "yellow",
      stroke: "black",
      paintFirst: 'stroke',
      fontSize,
      strokeWidth,
      width: maxLineWidthPx,
      left: width / 2,
      originX: 'center',
      top: startY + i * (fontSize + fontSize * 0.2),
      originY: 'top',
    });
    canvas.add(textObj);
  });

  canvas.renderAll();
  const dataUrl = canvas.toDataURL();
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);
  return imageBitmap;
}
