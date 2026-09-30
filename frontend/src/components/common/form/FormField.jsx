import { forwardRef } from "react";
import {
  ACTION_BTN_BASE,
  ACTION_ROW_CLS,
  ERROR_CLS,
  FORM_BODY_CLS,
  HINT_CLS,
  LABEL_CLS,
  STATIC_FIELD_CLS,
  inputCls,
  textareaCls,
} from "./fieldStyles";

export const FormLabel = ({ children, required, icon, className = "", ...rest }) => (
  <label className={`${LABEL_CLS} ${icon ? "gap-2" : "gap-0.5"} ${className}`} {...rest}>
    {icon}
    {children} {required && <span className="text-[#FF4935]">*</span>}
  </label>
);

export const FormError = ({ children }) =>
  children ? <p className={ERROR_CLS}>{children}</p> : null;

// Label + control + error/hint. `fieldRef` targets the block for scroll-to-error.
export const FormField = ({ label, required, error, hint, fieldRef, className, children }) => (
  <div ref={fieldRef} className={className}>
    {label && <FormLabel required={required}>{label}</FormLabel>}
    {children}
    {hint && <p className={HINT_CLS}>{hint}</p>}
    <FormError>{error}</FormError>
  </div>
);

export const TextInput = forwardRef(({ error, grow, className = "", ...props }, ref) => (
  <input ref={ref} className={`${inputCls({ error, grow })} ${className}`} {...props} />
));
TextInput.displayName = "TextInput";

export const TextArea = forwardRef(({ error, className = "", ...props }, ref) => (
  <textarea ref={ref} className={`${textareaCls({ error })} ${className}`} {...props} />
));
TextArea.displayName = "TextArea";

// Input + side button. The input takes the leftover width; the button keeps its own.
export const InputWithAction = ({ children, action }) => (
  <div className={ACTION_ROW_CLS}>
    <div className="flex-1 min-w-0">{children}</div>
    {action}
  </div>
);

// Round icon button (attach, add new) or short text button (Fetch).
export const FieldActionButton = ({ icon, children, className = "", ...props }) => (
  <button
    type="button"
    className={`${ACTION_BTN_BASE} ${icon ? "w-[38px] border border-[#1F2937]/10" : "px-4 text-[13px] font-bold font-inter"} ${className}`}
    {...props}
  >
    {icon || children}
  </button>
);

// Read-only file-name box with its attach button.
export const FilePickerField = ({ fileName, placeholder = "Choose a file", onPick, title, children }) => (
  <InputWithAction
    action={
      <FieldActionButton icon={children} onClick={onPick} title={title} aria-label={title} />
    }
  >
    <div onClick={onPick} className={`${STATIC_FIELD_CLS} cursor-pointer`}>
      <span className="text-[#1F2937] opacity-50 truncate">{fileName || placeholder}</span>
    </div>
  </InputWithAction>
);

// Equal-width columns with the standard gap.
export const FieldRow = ({ cols = 2, children }) => (
  <div className={`grid gap-3 ${cols === 3 ? "grid-cols-3" : "grid-cols-2"}`}>{children}</div>
);

// "── Title ──" divider used for Custom Fields, Social Media, etc.
export const SectionDivider = ({ children }) => (
  <div className="flex items-center gap-3">
    <span className="flex-1 h-px bg-[#D9D9D9]" />
    <h3 className="flex-shrink-0 text-[14px] font-medium leading-[120%] text-[#1F2937]">{children}</h3>
    <span className="flex-1 h-px bg-[#D9D9D9]" />
  </div>
);

export const FormBody = ({ children, className = "" }) => (
  <div className={`${FORM_BODY_CLS} ${className}`}>{children}</div>
);
