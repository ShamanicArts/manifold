import { createHighlighter } from 'shiki';

// Build-time only. Reading highlighted code needs neither JS nor an editor bundle.
const highlighter = await createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['javascript', 'typescript', 'json', 'rust', 'bash', 'toml', 'html', 'css', 'http'],
});
const languages = new Set(highlighter.getLoadedLanguages());
export function highlight(source, language, declaration) {
  const lang = language.trim().split(/\s+/)[0];
  // Missing grammars should fail authoring, never silently ship uncoloured code.
  if (!lang || (!languages.has(lang) && !['text', 'plaintext'].includes(lang)))
    throw new Error(`Handbook code fence needs a supported language: ${language || '(missing)'}`);
  return highlighter.codeToHtml(source.trimEnd(), {
    lang,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
    transformers: [
      {
        line(node, line) {
          if (declaration && line >= declaration[0] && line <= declaration[1])
            this.addClassToHast(node, 'declaration');
        },
      },
    ],
  });
}
