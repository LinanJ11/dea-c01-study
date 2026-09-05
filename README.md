# DEA-C01 Study Content

This folder contains **341 questions** extracted from `DEA-C01_题目.pdf`.

## Structure

- `questions/q001.md` ... `questions/q341.md`: one question per Markdown file.
- `manifest.json`: question id, file path, PDF reference answer, and AI-reviewed answer.
- `index.html`, `styles.css`, and `app.js`: the static study website.

## Study website

The website loads the manifest and the requested Markdown file directly in the browser. The Markdown files remain the source of truth and do not need to be copied into JavaScript.

To preview locally, serve this folder with any static web server and open its local URL. For example, if Python is installed:

```text
python -m http.server 8000
```

The included `.nojekyll` file keeps the Markdown question files available as raw static assets on GitHub Pages. Publish this folder from the repository root (or copy its contents into the configured Pages publishing folder); no build step is required.

## Review policy

- The question stem and options use `DEA-C01_题目.pdf` as the primary source.
- Answers in the answer PDF and community discussions are treated only as references.
- The `答案` field is the AI-reviewed answer used by the study site.
- If the reviewed answer differs from the answer PDF, the **first line of that question's Markdown file contains a warning**.
- Explanations are in Chinese while AWS service names and key technical terms are kept in English.

## Current review differences

- Q139: PDF `AB` → reviewed `BC`
- Q176: PDF `E` → reviewed `BD`
- Q250: PDF `C` → reviewed `D`
- Q261: PDF `BD` → reviewed `AB`

## For Codex / Kiro

The frontend can parse the Markdown files directly or preprocess them into JSON. Keep the Markdown files as the content source of truth so UI changes do not overwrite reviewed answers/explanations.
