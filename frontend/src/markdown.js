function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 轻量 Markdown：标题、加粗、行内代码、代码块、列表、换行。
 * 不引入 marked，避免为第三阶段多装依赖。
 */
export function renderMarkdown(source = "") {
  const codeBlocks = [];
  let text = String(source).replace(/```[\w-]*\n?([\s\S]*?)```/g, (_, code) => {
    const index = codeBlocks.length;
    codeBlocks.push(
      `<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`
    );
    return `\u0000CODE${index}\u0000`;
  });

  text = escapeHtml(text);
  text = text.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  text = text.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  text = text.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>");
  text = text.replace(/(?:<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);
  text = text.replace(/\n/g, "<br>");
  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => {
    return codeBlocks[Number(index)] || "";
  });
  return text;
}
