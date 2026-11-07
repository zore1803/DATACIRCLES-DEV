/*
 * "Custom fields" glyph: a form card with two field rows.
 *
 * Square 16x16 viewBox like the other common icons (UploadIcon, SettingsIcon),
 * so the usual `w-4 h-4` / `w-3.5 h-3.5` sizing stays centred; drawn in
 * currentColor so colour comes from a `text-*` class.
 */
const CustomFieldsIcon = ({ className = "w-4 h-4", size, style, ...props }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={size != null ? { width: size, height: size, ...style } : style}
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4.5 5.75H11.5M4.5 10.25H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export default CustomFieldsIcon;
