/**
 * Local MCP: structured PowerPoint decks with PptxGenJS (native shapes & text, not flat screenshots).
 * Output: ~/Downloads/<filename>.pptx — same path pattern as the previous integration for download tokens.
 */

import fs from "fs";
import os from "os";
import path from "path";
import pptxgen from "pptxgenjs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const W = 10;
const H = 5.625;

/** Hex without # */
const THEMES = {
  ocean: {
    primary: "0284C7",
    secondary: "0369A1",
    accent: "06B6D4",
    page: "F8FAFC",
    ink: "0F172A",
    muted: "64748B",
    onPrimary: "FFFFFF",
    card: "E0F2FE",
  },
  slate: {
    primary: "334155",
    secondary: "1E293B",
    accent: "64748B",
    page: "F1F5F9",
    ink: "0F172A",
    muted: "64748B",
    onPrimary: "FFFFFF",
    card: "E2E8F0",
  },
  aurora: {
    primary: "7C3AED",
    secondary: "5B21B6",
    accent: "A78BFA",
    page: "FAF5FF",
    ink: "1E1B4B",
    muted: "6B7280",
    onPrimary: "FFFFFF",
    card: "EDE9FE",
  },
  ember: {
    primary: "EA580C",
    secondary: "C2410C",
    accent: "FB923C",
    page: "FFF7ED",
    ink: "431407",
    muted: "9A3412",
    onPrimary: "FFFFFF",
    card: "FFEDD5",
  },
  noir: {
    primary: "18181B",
    secondary: "27272A",
    accent: "3F3F46",
    page: "FAFAFA",
    ink: "18181B",
    muted: "71717A",
    onPrimary: "FAFAFA",
    card: "F4F4F5",
  },
};

const slideSchema = z.discriminatedUnion("layout", [
  z.object({
    layout: z.literal("title"),
    title: z.string().min(1),
    subtitle: z.string().optional(),
  }),
  z.object({
    layout: z.literal("section"),
    title: z.string().min(1),
    subtitle: z.string().optional(),
  }),
  z.object({
    layout: z.literal("bullets"),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    bullets: z.array(z.string()).min(1),
  }),
  z.object({
    layout: z.literal("two_column"),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    left_heading: z.string().optional(),
    right_heading: z.string().optional(),
    left_bullets: z.array(z.string()).default([]),
    right_bullets: z.array(z.string()).default([]),
  }),
  z.object({
    layout: z.literal("metrics"),
    title: z.string().optional(),
    items: z
      .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
      .min(1)
      .max(4),
  }),
  z.object({
    layout: z.literal("quote"),
    text: z.string().min(1),
    attribution: z.string().optional(),
  }),
  z.object({
    layout: z.literal("closing"),
    title: z.string().min(1),
    lines: z.array(z.string()).optional(),
  }),
]);

function safeFilename(base) {
  const s = String(base || "presentation")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return s || "presentation";
}

function addTopAccentBar(slide, theme) {
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: W,
    h: 0.12,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
  });
}

function addLeftAccentStripe(slide, theme) {
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 0.2,
    h: H,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
  });
}

async function buildDeck({ deck_title, theme: themeKey, filename, slides }) {
  const theme = THEMES[themeKey] || THEMES.ocean;
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Nexus Agent";
  pres.title = deck_title;
  pres.subject = deck_title;

  for (const s of slides) {
    if (s.layout === "title") {
      const slide = pres.addSlide();
      slide.background = { color: theme.page };
      addLeftAccentStripe(slide, theme);
      slide.addShape("roundRect", {
        x: 6.8,
        y: 0.5,
        w: 2.8,
        h: 2.8,
        fill: { color: theme.card },
        line: { color: theme.accent, width: 1 },
        rectRadius: 0.08,
      });
      slide.addText(s.title, {
        x: 0.55,
        y: 1.35,
        w: 5.9,
        h: 1.35,
        fontSize: 38,
        bold: true,
        color: theme.ink,
        fontFace: "Arial",
        valign: "m",
      });
      if (s.subtitle) {
        slide.addText(s.subtitle, {
          x: 0.55,
          y: 2.85,
          w: 6.2,
          h: 0.9,
          fontSize: 16,
          color: theme.muted,
          fontFace: "Arial",
        });
      }
      slide.addText(deck_title, {
        x: 0.55,
        y: 4.85,
        w: 6,
        h: 0.45,
        fontSize: 11,
        color: theme.muted,
        fontFace: "Arial",
      });
      continue;
    }

    if (s.layout === "section") {
      const slide = pres.addSlide();
      slide.background = { color: theme.primary };
      slide.addText(s.title, {
        x: 0.55,
        y: 2,
        w: 8.9,
        h: 1.2,
        fontSize: 36,
        bold: true,
        color: theme.onPrimary,
        fontFace: "Arial",
        valign: "m",
      });
      if (s.subtitle) {
        slide.addText(s.subtitle, {
          x: 0.55,
          y: 3.35,
          w: 8.5,
          h: 0.7,
          fontSize: 18,
          color: theme.accent,
          fontFace: "Arial",
        });
      }
      slide.addShape("rect", {
        x: 0.55,
        y: 4.95,
        w: 1.8,
        h: 0.06,
        fill: { color: theme.onPrimary },
        line: { width: 0 },
      });
      continue;
    }

    if (s.layout === "bullets") {
      const slide = pres.addSlide();
      slide.background = { color: theme.page };
      addTopAccentBar(slide, theme);
      slide.addText(s.title, {
        x: 0.55,
        y: 0.45,
        w: 8.9,
        h: 0.75,
        fontSize: 28,
        bold: true,
        color: theme.ink,
        fontFace: "Arial",
      });
      let y = 1.25;
      if (s.subtitle) {
        slide.addText(s.subtitle, {
          x: 0.55,
          y: y,
          w: 8.9,
          h: 0.45,
          fontSize: 14,
          color: theme.muted,
          fontFace: "Arial",
        });
        y += 0.55;
      }
      slide.addShape("rect", {
        x: 0.45,
        y: y,
        w: 0.06,
        h: H - y - 0.55,
        fill: { color: theme.accent },
        line: { width: 0 },
      });
      const bulletText = s.bullets.map((b) => ({ text: b, options: { bullet: true, indentLevel: 0 } }));
      slide.addText(bulletText, {
        x: 0.7,
        y: y + 0.05,
        w: 8.75,
        h: H - y - 0.65,
        fontSize: 17,
        color: theme.ink,
        fontFace: "Arial",
        valign: "t",
        lineSpacing: 30,
      });
      continue;
    }

    if (s.layout === "two_column") {
      const slide = pres.addSlide();
      slide.background = { color: theme.page };
      addTopAccentBar(slide, theme);
      slide.addText(s.title, {
        x: 0.55,
        y: 0.45,
        w: 8.9,
        h: 0.75,
        fontSize: 26,
        bold: true,
        color: theme.ink,
        fontFace: "Arial",
      });
      let y0 = 1.35;
      if (s.subtitle) {
        slide.addText(s.subtitle, {
          x: 0.55,
          y: 1.2,
          w: 8.9,
          h: 0.4,
          fontSize: 13,
          color: theme.muted,
          fontFace: "Arial",
        });
        y0 = 1.65;
      }
      slide.addShape("rect", {
        x: 4.95,
        y: y0,
        w: 0.04,
        h: H - y0 - 0.5,
        fill: { color: theme.primary },
        line: { width: 0 },
      });

      const colTop = y0 + 0.15;
      const colH = H - colTop - 0.55;
      const colW = 4.15;

      if (s.left_heading) {
        slide.addText(s.left_heading, {
          x: 0.55,
          y: colTop,
          w: colW,
          h: 0.4,
          fontSize: 14,
          bold: true,
          color: theme.primary,
          fontFace: "Arial",
        });
      }
      const leftBullets = s.left_bullets.map((b) => ({ text: b, options: { bullet: true } }));
      slide.addText(leftBullets.length ? leftBullets : [{ text: " ", options: {} }], {
        x: 0.55,
        y: colTop + (s.left_heading ? 0.45 : 0),
        w: colW,
        h: colH - (s.left_heading ? 0.45 : 0),
        fontSize: 15,
        color: theme.ink,
        fontFace: "Arial",
        valign: "t",
        lineSpacing: 28,
      });

      if (s.right_heading) {
        slide.addText(s.right_heading, {
          x: 5.2,
          y: colTop,
          w: colW,
          h: 0.4,
          fontSize: 14,
          bold: true,
          color: theme.primary,
          fontFace: "Arial",
        });
      }
      const rightBullets = s.right_bullets.map((b) => ({ text: b, options: { bullet: true } }));
      slide.addText(rightBullets.length ? rightBullets : [{ text: " ", options: {} }], {
        x: 5.2,
        y: colTop + (s.right_heading ? 0.45 : 0),
        w: colW,
        h: colH - (s.right_heading ? 0.45 : 0),
        fontSize: 15,
        color: theme.ink,
        fontFace: "Arial",
        valign: "t",
        lineSpacing: 28,
      });
      continue;
    }

    if (s.layout === "metrics") {
      const slide = pres.addSlide();
      slide.background = { color: theme.page };
      addTopAccentBar(slide, theme);
      if (s.title) {
        slide.addText(s.title, {
          x: 0.55,
          y: 0.45,
          w: 8.9,
          h: 0.65,
          fontSize: 26,
          bold: true,
          color: theme.ink,
          fontFace: "Arial",
        });
      }
      const n = s.items.length;
      const gap = 0.35;
      const cardW = (W - 1.1 - (n - 1) * gap) / n;
      let x = 0.55;
      const top = s.title ? 1.45 : 1.1;
      for (const item of s.items) {
        slide.addShape("roundRect", {
          x,
          y: top,
          w: cardW,
          h: 2.85,
          fill: { color: theme.card },
          line: { color: theme.accent, width: 1 },
          rectRadius: 0.12,
        });
        slide.addText(item.value, {
          x,
          y: top + 0.45,
          w: cardW,
          h: 1.1,
          fontSize: 32,
          bold: true,
          color: theme.primary,
          fontFace: "Arial",
          align: "center",
          valign: "m",
        });
        slide.addText(item.label, {
          x: x + 0.15,
          y: top + 1.55,
          w: cardW - 0.3,
          h: 1.1,
          fontSize: 14,
          color: theme.muted,
          fontFace: "Arial",
          align: "center",
          valign: "t",
        });
        x += cardW + gap;
      }
      continue;
    }

    if (s.layout === "quote") {
      const slide = pres.addSlide();
      slide.background = { color: theme.page };
      addLeftAccentStripe(slide, theme);
      slide.addText("“", {
        x: 0.55,
        y: 1.1,
        w: 1,
        h: 0.8,
        fontSize: 64,
        color: theme.accent,
        fontFace: "Georgia",
      });
      slide.addText(s.text, {
        x: 0.55,
        y: 1.65,
        w: 8.5,
        h: 2.2,
        fontSize: 22,
        italic: true,
        color: theme.ink,
        fontFace: "Georgia",
        valign: "t",
      });
      if (s.attribution) {
        slide.addText(`— ${s.attribution}`, {
          x: 0.55,
          y: 4.05,
          w: 8.5,
          h: 0.5,
          fontSize: 14,
          color: theme.muted,
          fontFace: "Arial",
        });
      }
      continue;
    }

    if (s.layout === "closing") {
      const slide = pres.addSlide();
      slide.background = { color: theme.primary };
      slide.addText(s.title, {
        x: 0.55,
        y: 1.85,
        w: 8.9,
        h: 1,
        fontSize: 40,
        bold: true,
        color: theme.onPrimary,
        fontFace: "Arial",
        align: "center",
        valign: "m",
      });
      if (s.lines?.length) {
        slide.addText(s.lines.join("\n"), {
          x: 1.2,
          y: 3.05,
          w: 7.6,
          h: 1.8,
          fontSize: 16,
          color: theme.card,
          fontFace: "Arial",
          align: "center",
          valign: "t",
          lineSpacing: 28,
        });
      }
    }
  }

  const downloads = path.join(os.homedir(), "Downloads");
  if (!fs.existsSync(downloads)) {
    fs.mkdirSync(downloads, { recursive: true });
  }
  const base = safeFilename(filename || deck_title);
  const outPath = path.join(downloads, `${base}.pptx`);
  await pres.writeFile({ fileName: outPath });
  return outPath;
}

const mcpServer = new McpServer({ name: "rich-ppt-mcp", version: "1.0.0" });

mcpServer.registerTool(
  "create_structured_deck",
  {
    description:
      "Build a polished .pptx with designed layouts (accent bars, section dividers, two-column, metric cards, quotes). Uses native PowerPoint shapes and typography — prefer this over plain text dumps. For topic-only requests, research first (web search), then pass 6–15 slides mixing: title, section, bullets, two_column, metrics, quote, closing. Themes: ocean | slate | aurora | ember | noir.",
    inputSchema: {
      deck_title: z.string().min(1).describe("Overall deck / document title shown on the title slide."),
      theme: z
        .enum(["ocean", "slate", "aurora", "ember", "noir"])
        .optional()
        .describe("Visual theme (default ocean)."),
      filename: z
        .string()
        .optional()
        .describe("Base filename without extension (safe ASCII); defaults from deck_title."),
      slides: z
        .array(slideSchema)
        .min(1)
        .describe(
          "Ordered slides. layout=title|section|bullets|two_column|metrics|quote|closing. Use section between topics; bullets for lists; two_column for compare/contrast; metrics for KPIs; quote for testimonials or key statements; closing for thank-you / CTA."
        ),
    },
  },
  async ({ deck_title, theme, filename, slides }) => {
    try {
      const themeKey = theme || "ocean";
      const outPath = await buildDeck({ deck_title, theme: themeKey, filename, slides });
      const text = `Presentation successfully created and saved to: ${outPath}`;
      return { content: [{ type: "text", text }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Failed to create presentation: ${msg}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error("rich-ppt-mcp fatal:", err);
  process.exit(1);
});
