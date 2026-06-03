import type { ReactNode } from "react";

type InlineToken = {
  type: "strong" | "em" | "u";
  markerStart: string;
  markerEnd: string;
};

const INLINE_TOKENS: InlineToken[] = [
  { type: "strong", markerStart: "**", markerEnd: "**" },
  { type: "u", markerStart: "<u>", markerEnd: "</u>" },
  { type: "em", markerStart: "*", markerEnd: "*" },
];

function renderInlineText(text: string, keyPrefix: string): ReactNode[] {
  if (!text) return [];

  let firstMatch:
    | {
        token: InlineToken;
        start: number;
        contentStart: number;
        end: number;
      }
    | null = null;

  for (const token of INLINE_TOKENS) {
    const start = text.indexOf(token.markerStart);
    if (start < 0) continue;
    const contentStart = start + token.markerStart.length;
    const end = text.indexOf(token.markerEnd, contentStart);
    if (end < 0) continue;
    if (!firstMatch || start < firstMatch.start) {
      firstMatch = { token, start, contentStart, end };
    }
  }

  if (!firstMatch) return [text];

  const before = text.slice(0, firstMatch.start);
  const content = text.slice(firstMatch.contentStart, firstMatch.end);
  const after = text.slice(firstMatch.end + firstMatch.token.markerEnd.length);
  const renderedContent = renderInlineText(content, `${keyPrefix}-inner`);
  const elementKey = `${keyPrefix}-${firstMatch.start}-${firstMatch.end}`;
  const marked =
    firstMatch.token.type === "strong" ? (
      <strong key={elementKey}>{renderedContent}</strong>
    ) : firstMatch.token.type === "u" ? (
      <u key={elementKey}>{renderedContent}</u>
    ) : (
      <em key={elementKey}>{renderedContent}</em>
    );

  return [...renderInlineText(before, `${keyPrefix}-before`), marked, ...renderInlineText(after, `${keyPrefix}-after`)];
}

function renderLine(line: string, keyPrefix: string): ReactNode[] {
  const parts = line.split("\n");
  return parts.flatMap((part, index) => {
    const nodes = renderInlineText(part, `${keyPrefix}-${index}`);
    return index === parts.length - 1 ? nodes : [...nodes, <br key={`${keyPrefix}-br-${index}`} />];
  });
}

export default function FormattedOfferDescription(props: { text: string | null | undefined; className?: string }) {
  const text = props.text?.trim();
  if (!text) return null;

  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <div className={props.className ?? "space-y-4 leading-7"}>
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 12)}`}>{renderLine(paragraph, `p-${index}`)}</p>
      ))}
    </div>
  );
}
