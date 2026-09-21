import CheckboxEmptyIcon from "./CheckboxEmptyIcon";
import CheckboxCheckedIcon from "./CheckboxCheckedIcon";

/*
 * The product's checkbox control — a real <input type="checkbox"> (so focus,
 * keyboard toggling, form submission, and screen readers all keep working
 * exactly like a native checkbox) with the browser's own box hidden and the
 * design system's empty/checked glyphs drawn in its place.
 *
 * Drop-in replacement for a plain `<input type="checkbox" className="w-4 h-4
 * ..." ... />`: pass the same `checked`, `onChange`, `disabled`, `id`, `name`
 * props straight through. `className` sizes/positions the icon (defaults to
 * `w-4 h-4`); `iconClassName` adds non-color extras (e.g. `flex-shrink-0`).
 * Colour comes from `checkedColor`/`uncheckedColor` (not `iconClassName`) —
 * two Tailwind `text-*` utilities in one string have equal CSS specificity,
 * so whichever the caller appended wouldn't reliably win; a dedicated prop
 * avoids that tie. The wrapping `<label>` keeps the full glyph clickable,
 * not just the invisible native input.
 */
const Checkbox = ({
  checked = false,
  onChange,
  disabled = false,
  className = "w-4 h-4",
  iconClassName = "",
  wrapperClassName = "",
  checkedColor = "text-blue-600",
  uncheckedColor = "text-gray-300",
  ...props
}) => {
  const Icon = checked ? CheckboxCheckedIcon : CheckboxEmptyIcon;
  const colorClass = checked ? checkedColor : uncheckedColor;

  return (
    <label
      className={`relative inline-flex items-center justify-center flex-shrink-0 ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${wrapperClassName}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0 p-0 z-10"
        {...props}
      />
      <Icon className={`${className} ${colorClass} ${iconClassName} relative z-0`} />
    </label>
  );
};

export default Checkbox;
