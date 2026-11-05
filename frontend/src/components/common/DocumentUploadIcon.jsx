/*
 * Document-with-upload-arrow glyph for document/file upload areas. Outline
 * style; stroke is currentColor so colour comes from a `text-*` class.
 */
const DocumentUploadIcon = ({ className = "w-4 h-4", size, style, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={size != null ? { width: size, height: size, ...style } : style}
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M17 12.5V6.5L12.5 2H4.5C3.7 2 3 2.7 3 3.5V19.5C3 20.3 3.7 21 4.5 21H11" />
    <path d="M12 2.5V5.5C12 6.3 12.7 7 13.5 7H17" />
    <path d="M6.5 10H11M6.5 13H9.5M6.5 16H9" />
    <circle cx="17.5" cy="17.5" r="4.5" />
    <path d="M17.5 20V15.2M15.4 17.2L17.5 15.1L19.6 17.2" />
  </svg>
);

export default DocumentUploadIcon;
