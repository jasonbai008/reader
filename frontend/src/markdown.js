import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * 用 marked 解析 Markdown，供 v-html 使用。
 */
export function renderMarkdown(source = "") {
  return marked.parse(String(source ?? ""), { async: false });
}
