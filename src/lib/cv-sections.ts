export type ParsedCvSection = {
  label: string;
  text: string;
  group?: string;
};

type SplitCvOptions = {
  beautify?: boolean;
};

type HeadingDefinition = {
  label: string;
  aliases: string[];
};

const headingDefinitions: HeadingDefinition[] = [
  {
    label: "Professional Summary",
    aliases: [
      "professional summary",
      "summary",
      "profile",
      "career profile",
      "personal profile",
      "objective",
      "career objective",
      "about me",
    ],
  },
  {
    label: "Core Skills",
    aliases: [
      "core skills",
      "key skills",
      "skills",
      "technical skills",
      "skills and expertise",
      "skills & expertise",
      "competencies",
      "key competencies",
      "areas of expertise",
    ],
  },
  {
    label: "Professional Experience",
    aliases: [
      "professional experience",
      "work experience",
      "experience",
      "employment",
      "employment history",
      "career history",
      "work history",
      "professional background",
    ],
  },
  {
    label: "Education",
    aliases: [
      "education",
      "academic background",
      "education and training",
      "education & training",
    ],
  },
  {
    label: "Certifications",
    aliases: [
      "certifications",
      "certificates",
      "licenses",
      "courses",
      "training",
      "professional development",
      "certifications and training",
      "certifications & training",
    ],
  },
  {
    label: "Projects",
    aliases: [
      "projects",
      "selected projects",
      "project experience",
      "portfolio",
    ],
  },
  {
    label: "Languages",
    aliases: ["languages", "language skills"],
  },
  {
    label: "Achievements",
    aliases: [
      "achievements",
      "awards",
      "honors",
      "awards and achievements",
      "awards & achievements",
    ],
  },
  {
    label: "Volunteer Experience",
    aliases: ["volunteer experience", "volunteering", "volunteer work"],
  },
  {
    label: "Interests",
    aliases: ["interests", "hobbies", "additional information"],
  },
];

const headingAliases = headingDefinitions
  .flatMap((definition) =>
    definition.aliases.map((alias) => ({ alias, definition })),
  )
  .sort((left, right) => right.alias.length - left.alias.length);

const headerLabels = new Set(["Name", "Title", "Contact", "Header"]);

export function splitCvSections(
  text: string,
  options: SplitCvOptions = {},
): ParsedCvSection[] {
  const normalizedText = normalizeCvText(text);
  if (!normalizedText) return [];

  const lines = normalizedText.split("\n");
  const introLines: string[] = [];
  const bodySections: ParsedCvSection[] = [];
  let current: ParsedCvSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (isPdfPageMarker(line)) {
      continue;
    }

    const heading = matchHeadingLine(line);

    if (heading) {
      if (current?.text.trim()) {
        bodySections.push({ ...current, text: cleanSectionText(current.text) });
      }

      current = { label: heading.label, text: "" };

      if (heading.rest) {
        current.text = `${heading.rest}\n`;
      }

      continue;
    }

    if (current) {
      current.text += `${line}\n`;
    } else {
      introLines.push(line);
    }
  }

  if (current?.text.trim()) {
    bodySections.push({ ...current, text: cleanSectionText(current.text) });
  }

  const sections = compactSections([...splitIntroLines(introLines), ...bodySections]);

  const normalizedSections = options.beautify
    ? sections.map((section) => ({
        ...section,
        text: beautifySectionText(section.label, section.text),
      }))
    : sections;

  return expandCompositeSections(normalizedSections);
}

export function composeCvSections(sections: ParsedCvSection[]) {
  let activeGroup = "";

  return sections
    .map((section) => {
      const text = section.text.trim();
      if (!text && !section.group) return "";

      if (section.group) {
        const groupHeading = section.group !== activeGroup ? section.group : "";
        activeGroup = section.group;
        return [groupHeading, section.label, text].filter(Boolean).join("\n");
      }

      activeGroup = "";
      if (headerLabels.has(section.label)) return text;
      return `${section.label}\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function normalizeCvText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ \f\v]+\n/g, "\n")
    .replace(/\n[ \f\v]+/g, "\n")
    .replace(/[ \f\v]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntroLines(lines: string[]): ParsedCvSection[] {
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  if (!cleaned.length) return [];

  const mainLines: string[] = [];
  const contactLines: string[] = [];

  for (const line of cleaned) {
    if (looksLikeContactLine(line)) {
      contactLines.push(line);
    } else {
      mainLines.push(line);
    }
  }

  const sections: ParsedCvSection[] = [];

  if (mainLines[0]) {
    sections.push({ label: "Name", text: mainLines[0] });
  }

  if (mainLines[1]) {
    sections.push({ label: "Title", text: mainLines[1] });
  }

  if (contactLines.length) {
    sections.push({ label: "Contact", text: contactLines.join("\n") });
  }

  if (mainLines.length > 2) {
    sections.push({ label: "Header", text: mainLines.slice(2).join("\n") });
  }

  return sections;
}

function matchHeadingLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const normalized = normalizeHeadingCandidate(trimmed);

  for (const { alias, definition } of headingAliases) {
    if (normalized === alias) {
      return { label: definition.label, rest: "" };
    }

    const pattern = new RegExp(`^${escapeAlias(alias)}\\b`, "i");
    const match = trimmed.match(pattern);

    if (!match) continue;

    const rest = trimmed.slice(match[0].length).trim();
    if (!rest) return { label: definition.label, rest: "" };

    const hasDivider = /^[:|\-\u2013\u2014]/.test(rest);
    const cleanedRest = rest.replace(/^[:|\-\u2013\u2014]\s*/, "").trim();

    if (hasDivider) {
      return { label: definition.label, rest: cleanedRest };
    }

    if (
      cleanedRest &&
      isHeadingCased(match[0]) &&
      (alias.includes(" ") || isStrongHeadingLine(trimmed))
    ) {
      return { label: definition.label, rest: cleanedRest };
    }
  }

  return null;
}

function normalizeHeadingCandidate(value: string) {
  return value
    .replace(/^[*\-\u2022\u25E6\u00B7\s]+/, "")
    .replace(/[:|\-\u2013\u2014\s]+$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function escapeAlias(alias: string) {
  return alias
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
}

function looksLikeContactLine(line: string) {
  return (
    /@/.test(line) ||
    /\+\d/.test(line) ||
    /\b(?:linkedin|github|portfolio|https?:|www\.)\b/i.test(line) ||
    (line.includes("|") && /\d|@|linkedin|github|https?:/i.test(line))
  );
}

function isHeadingCased(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((word) => /^[A-Z0-9&/]/.test(word));
}

function isStrongHeadingLine(value: string) {
  const letters = value.replace(/[^A-Za-z]/g, "");
  if (!letters) return false;

  const upperCaseLetters = letters.replace(/[^A-Z]/g, "");

  return value.length <= 80 && upperCaseLetters.length / letters.length > 0.7;
}

function isPdfPageMarker(line: string) {
  return /^--\s*\d+\s+of\s+\d+\s*--$/i.test(line.trim());
}

function cleanSectionText(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function compactSections(sections: ParsedCvSection[]) {
  const compact: ParsedCvSection[] = [];

  for (const section of sections) {
    const text = cleanSectionText(section.text);
    if (!text) continue;

    const previous = compact.at(-1);

    if (previous?.label === section.label) {
      previous.text = cleanSectionText(`${previous.text}\n\n${text}`);
    } else {
      compact.push({ label: section.label, text });
    }
  }

  return compact.slice(0, 24);
}

function expandCompositeSections(sections: ParsedCvSection[]) {
  return sections.flatMap((section) => {
    if (section.label === "Professional Experience") {
      return splitExperienceEntries(section);
    }

    return [section];
  });
}

function splitExperienceEntries(section: ParsedCvSection) {
  const lines = section.text.split("\n").map((line) => line.trimEnd());
  const entries: ParsedCvSection[] = [];
  const preface: string[] = [];
  let currentLabel = "";
  let currentBody: string[] = [];

  function pushCurrent() {
    if (!currentLabel) return;

    entries.push({
      label: currentLabel,
      text: cleanSectionText(currentBody.join("\n")),
      group: section.label,
    });

    currentLabel = "";
    currentBody = [];
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (currentBody.length && currentBody.at(-1) !== "") {
        currentBody.push("");
      }
      continue;
    }

    if (looksLikeStandaloneEntry("Professional Experience", trimmed)) {
      if (!currentLabel && preface.length === 1 && looksLikeRoleTitle(preface[0])) {
        currentLabel = `${preface.pop()} - ${trimmed}`;
        continue;
      }

      if (!currentLabel && preface.length > 1) {
        currentLabel = trimmed;
        continue;
      }

      pushCurrent();
      currentLabel = trimmed;
      continue;
    }

    if (!currentLabel) {
      preface.push(trimmed);
      continue;
    }

    currentBody.push(trimmed);
  }

  pushCurrent();

  if (!entries.length) {
    return [section];
  }

  if (preface.length) {
    return [
      { label: section.label, text: cleanSectionText(preface.join("\n")) },
      ...entries,
    ];
  }

  return entries;
}

function beautifySectionText(label: string, text: string) {
  if (headerLabels.has(label)) {
    return cleanSectionText(text);
  }

  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd());
  const output: string[] = [];
  let paragraph = "";
  let bullet = "";

  function flushParagraph() {
    const value = paragraph.trim();
    if (value) output.push(value);
    paragraph = "";
  }

  function flushBullet() {
    const value = bullet.trim();
    if (value) output.push(value);
    bullet = "";
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushParagraph();
      flushBullet();
      if (output.at(-1) !== "") {
        output.push("");
      }
      continue;
    }

    if (isBulletLine(trimmed)) {
      flushParagraph();
      flushBullet();
      bullet = normalizeBulletLine(trimmed);
      continue;
    }

    if (bullet) {
      if (looksLikeStandaloneEntry(label, trimmed)) {
        flushBullet();
        if (shouldSeparateStandaloneEntry(label, output)) {
          output.push("");
        }
        output.push(trimmed);
        continue;
      }

      bullet = joinWrappedLine(bullet, trimmed);
      continue;
    }

    if (looksLikeStandaloneEntry(label, trimmed)) {
      flushParagraph();
      if (shouldSeparateStandaloneEntry(label, output)) {
        output.push("");
      }
      output.push(trimmed);
      continue;
    }

    paragraph = paragraph ? joinWrappedLine(paragraph, trimmed) : trimmed;
  }

  flushParagraph();
  flushBullet();

  return cleanSectionText(output.join("\n").replace(/\n{3,}/g, "\n\n"));
}

function isBulletLine(line: string) {
  return /^[\u2022\u25E6\u00B7*-]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
}

function normalizeBulletLine(line: string) {
  return line
    .replace(/^[\u25E6\u00B7*-]\s+/, "- ")
    .replace(/^\u2022\s+/, "- ")
    .replace(/^(\d+[.)])\s+/, "$1 ");
}

function looksLikeStandaloneEntry(label: string, line: string) {
  if (isBulletLine(line)) {
    return false;
  }

  if (label === "Professional Experience") {
    return (
      /[()\d]{6,}/.test(line) ||
      /(?:\u2013|-|,)\s*[A-Z]/.test(line) ||
      /\b(?:present|current)\b/i.test(line)
    );
  }

  if (label === "Education" || label === "Certifications") {
    return /(?:\u2013|-|,)\s*[A-Z]/.test(line) || /\(\d{4}/.test(line);
  }

  return false;
}

function joinWrappedLine(base: string, next: string) {
  const needsSpace = !/[/-]$/.test(base);
  return `${base}${needsSpace ? " " : ""}${next}`.replace(/\s+/g, " ").trim();
}

function shouldSeparateStandaloneEntry(label: string, output: string[]) {
  return (
    (label === "Professional Experience" ||
      label === "Education" ||
      label === "Certifications") &&
    output.length > 0 &&
    output.at(-1) !== ""
  );
}

function looksLikeRoleTitle(line: string) {
  return (
    line.length > 6 &&
    line.length < 90 &&
    !/[|()]/.test(line) &&
    !/\d{4}/.test(line) &&
    !looksLikeContactLine(line)
  );
}
