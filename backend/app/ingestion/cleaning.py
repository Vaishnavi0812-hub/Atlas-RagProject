"""Text normalisation applied after extraction and before chunking."""

import re
import unicodedata

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f​‌‍﻿]")
_HYPHEN_BREAK = re.compile(r"(\w)-\n(\w)")
_SPACES = re.compile(r"[ \t ]+")
_MANY_NEWLINES = re.compile(r"\n{3,}")
_BLOCK_START = re.compile(r"^([-•*#|>]|\d+[.)]\s|[A-Z][A-Za-z ]{0,30}:)")


def _reflow(text: str) -> str:
    """Join visual line wraps inside PDF paragraphs.

    A line that runs (nearly) the full text width wrapped because it ran out of
    space, so the next line continues the same paragraph. Short lines are
    deliberate breaks (headings, "Label: value" fields, last line of a
    paragraph) and are kept, as are lines that start a list item.
    """
    lines = text.split("\n")
    lengths = sorted(len(line) for line in lines if line)
    if len(lengths) < 3:
        return text
    full_width = lengths[int(len(lengths) * 0.9)]
    threshold = full_width * 0.8
    out = [lines[0]]
    for line in lines[1:]:
        prev = out[-1]
        if prev and line and len(prev) >= threshold and not _BLOCK_START.match(line):
            out[-1] = f"{prev} {line}"
        else:
            out.append(line)
    return "\n".join(out)


def clean_text(text: str, *, reflow: bool = False) -> str:
    """Normalise unicode and whitespace.

    `reflow` joins soft line breaks within paragraphs; it is enabled for PDFs,
    whose extracted text breaks at every visual line.
    """
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL.sub("", text)
    text = _HYPHEN_BREAK.sub(r"\1\2", text)
    text = _SPACES.sub(" ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    if reflow:
        text = _reflow(text)
    text = _MANY_NEWLINES.sub("\n\n", text)
    return text.strip()


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text))


def plural(n: int, word: str) -> str:
    return f"{n:,} {word}{'' if n == 1 else 's'}"
