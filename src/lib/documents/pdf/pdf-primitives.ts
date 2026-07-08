type PdfFontName = "F1" | "F2";

type PdfLine = {
  text: string;
  fontSize?: number;
  fontName?: PdfFontName;
  color?: [number, number, number];
  leading?: number;
};

type PdfPage = {
  commands: string[];
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN_X = 54;
const PAGE_MARGIN_TOP = 60;
const PAGE_MARGIN_BOTTOM = 56;
const DEFAULT_FONT_SIZE = 11;
const DEFAULT_LEADING = 16;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN_X * 2;

const WIN_ANSI_BYTES: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  "ˆ": 0x88,
  "‰": 0x89,
  "Š": 0x8a,
  "‹": 0x8b,
  "Œ": 0x8c,
  "Ž": 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  "š": 0x9a,
  "›": 0x9b,
  "œ": 0x9c,
  "ž": 0x9e,
  "Ÿ": 0x9f,
};

function normalizePdfText(input: string): string {
  return input
    .replace(/â‚¬/g, "€")
    .replace(/Ã„/g, "Ä")
    .replace(/Ã–/g, "Ö")
    .replace(/Ãœ/g, "Ü")
    .replace(/Ã¤/g, "ä")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã¼/g, "ü")
    .replace(/ÃŸ/g, "ß")
    .replace(/\r?\n/g, " ");
}

function toWinAnsiBinaryString(input: string): string {
  let output = "";
  for (const char of normalizePdfText(input)) {
    const code = char.charCodeAt(0);
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      output += String.fromCharCode(code);
      continue;
    }

    output += String.fromCharCode(WIN_ANSI_BYTES[char] ?? 0x20);
  }

  return output;
}

function escapePdfText(input: string): string {
  return toWinAnsiBinaryString(input)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function estimateMaxChars(fontSize: number): number {
  return Math.max(24, Math.floor(CONTENT_WIDTH / Math.max(5, fontSize * 0.52)));
}

function wrapLine(text: string, fontSize: number): string[] {
  const normalized = normalizePdfText(text).trim();
  if (!normalized) {
    return [""];
  }

  const maxChars = estimateMaxChars(fontSize);
  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    if (word.length <= maxChars) {
      current = word;
      continue;
    }

    let remaining = word;
    while (remaining.length > maxChars) {
      lines.push(remaining.slice(0, maxChars - 1) + "-");
      remaining = remaining.slice(maxChars - 1);
    }
    current = remaining;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function createNewPage(): { page: PdfPage; cursorY: number } {
  return {
    page: { commands: [] },
    cursorY: PAGE_HEIGHT - PAGE_MARGIN_TOP,
  };
}

function setTextCommand(input: {
  x: number;
  y: number;
  text: string;
  fontName: PdfFontName;
  fontSize: number;
  color: [number, number, number];
}): string {
  const [r, g, b] = input.color;
  return `BT /${input.fontName} ${input.fontSize} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg 1 0 0 1 ${input.x.toFixed(2)} ${input.y.toFixed(2)} Tm (${escapePdfText(input.text)}) Tj ET`;
}

function buildContentStream(commands: string[]): string {
  return commands.join("\n");
}

function createPdfObject(index: number, body: string): string {
  return `${index} 0 obj\n${body}\nendobj\n`;
}

export function createSimplePdfBuffer(lines: PdfLine[]): Buffer {
  const pages: PdfPage[] = [];
  let { page, cursorY } = createNewPage();

  for (const line of lines) {
    const fontSize = line.fontSize ?? DEFAULT_FONT_SIZE;
    const fontName = line.fontName ?? "F1";
    const color = line.color ?? ([0.16, 0.17, 0.20] as [number, number, number]);
    const leading = line.leading ?? DEFAULT_LEADING;
    const wrappedLines = wrapLine(line.text, fontSize);

    for (const wrappedLine of wrappedLines) {
      if (cursorY - leading < PAGE_MARGIN_BOTTOM) {
        pages.push(page);
        ({ page, cursorY } = createNewPage());
      }

      page.commands.push(
        setTextCommand({
          x: PAGE_MARGIN_X,
          y: cursorY,
          text: wrappedLine,
          fontName,
          fontSize,
          color,
        })
      );
      cursorY -= leading;
    }
  }

  pages.push(page);

  const objects: string[] = [];
  const catalogObjectNumber = 1;
  const pagesObjectNumber = 2;
  const fontRegularObjectNumber = 3;
  const fontBoldObjectNumber = 4;
  const firstPageObjectNumber = 5;
  const firstContentObjectNumber = firstPageObjectNumber + pages.length;

  const pageObjectNumbers = pages.map((_, index) => firstPageObjectNumber + index);
  const contentObjectNumbers = pages.map((_, index) => firstContentObjectNumber + index);

  objects.push(
    createPdfObject(catalogObjectNumber, `<< /Type /Catalog /Pages ${pagesObjectNumber} 0 R >>`),
    createPdfObject(
      pagesObjectNumber,
      `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectNumbers.map((id) => `${id} 0 R`).join(" ")}] >>`
    ),
    createPdfObject(fontRegularObjectNumber, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`),
    createPdfObject(fontBoldObjectNumber, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`)
  );

  for (let index = 0; index < pages.length; index += 1) {
    const contentStream = buildContentStream(pages[index].commands);
    objects.push(
      createPdfObject(
        pageObjectNumbers[index],
        `<< /Type /Page /Parent ${pagesObjectNumber} 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 ${fontRegularObjectNumber} 0 R /F2 ${fontBoldObjectNumber} 0 R >> >> /Contents ${contentObjectNumbers[index]} 0 R >>`
      ),
      createPdfObject(
        contentObjectNumbers[index],
        `<< /Length ${Buffer.byteLength(contentStream, "binary")} >>\nstream\n${contentStream}\nendstream`
      )
    );
  }

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}
