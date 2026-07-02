// Safely render LLM-generated analysis text into a limited HTML subset.
//
// The model output is NOT trusted HTML, so we escape all HTML entities first,
// then re-introduce only the two transforms we intend to support:
//   • "\n"      → <br/>
//   • "**bold**" → <strong>bold</strong>
// This neutralises any markup/event handlers the model might emit (preventing
// stored/DOM XSS) while keeping the intended formatting.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAnalysisHtml(text) {
  if (text == null) return '';
  return escapeHtml(text)
    .replace(/\n/g, '<br/>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
