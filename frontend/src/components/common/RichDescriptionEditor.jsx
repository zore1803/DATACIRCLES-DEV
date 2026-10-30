import React, { useMemo } from "react";
import ReactQuill from "react-quill-new";
import "react-quill/dist/quill.snow.css";

/*
 * Compact rich-text editor for a line item's description: bold, italic,
 * underline, strikethrough, numbered and bulleted lists.
 *
 * The value is an HTML string. Descriptions saved before this editor existed are
 * plain text (newline-separated), so they are converted to paragraphs when they
 * are loaded. An empty editor is reported as "" rather than Quill's "<p><br></p>"
 * so "no description" still means an empty string everywhere else.
 */

const MODULES = {
  toolbar: [
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["clean"],
  ],
};
const FORMATS = ["bold", "italic", "underline", "strike", "list"];

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const looksLikeHtml = (s) => /<\/?(p|strong|em|b|i|u|s|ol|ul|li|br)(\s|\/?>)/i.test(s);

// Plain text -> one <p> per line; HTML passes through untouched.
const toHtml = (value) => {
  const v = typeof value === "string" ? value : "";
  if (!v) return "";
  if (looksLikeHtml(v)) return v;
  return v
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
    .join("");
};

const isEmptyHtml = (html) =>
  !html || html.replace(/<(?!img)[^>]*>/gi, "").replace(/&nbsp;/g, "").trim() === "";

const RichDescriptionEditor = ({
  value,
  onChange,
  placeholder = "Item description…",
  minHeight = 48,
  maxHeight = 140,
  className = "",
}) => {
  const html = useMemo(() => toHtml(value), [value]);
  return (
    <div
      className={`dc-rich-description ${className}`}
      style={{ "--rd-min": `${minHeight}px`, "--rd-max": maxHeight ? `${maxHeight}px` : "none" }}
    >
      <ReactQuill
        theme="snow"
        value={html}
        onChange={(next) => onChange(isEmptyHtml(next) ? "" : next)}
        modules={MODULES}
        formats={FORMATS}
        placeholder={placeholder}
      />
    </div>
  );
};

export default RichDescriptionEditor;
