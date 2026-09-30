// Single source for form field styling (pill style: 38px, rounded-full).
const BASE =
  "border rounded-full px-3 h-[38px] text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter disabled:bg-gray-50 disabled:text-gray-400";

const stateCls = (error) =>
  error ? "border-red-500 focus:ring-red-500" : "border-[#1F2937]/10 focus:ring-blue-500";

export const LABEL_CLS =
  "flex items-center text-[13px] font-medium text-[#161618] tracking-[-0.05em] mb-2";

export const ERROR_CLS = "text-red-500 text-xs mt-1 font-inter";

export const HINT_CLS = "text-[13px] font-inter text-[#A0A0A0] mt-1.5 uppercase font-medium";

// Scroll area of a drawer/modal form.
export const FORM_BODY_CLS = "flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6";

// Text input. `grow` makes it share a row with a button instead of filling it.
export const inputCls = ({ error = false, grow = false } = {}) =>
  `${grow ? "flex-1 min-w-0" : "w-full"} ${BASE} ${stateCls(error)}`;

// Multi-line text. Rounded corners instead of a pill so long text isn't clipped.
export const textareaCls = ({ error = false } = {}) =>
  `w-full border rounded-2xl px-3 py-2 text-[13px] text-[#1F2937] focus:outline-none focus:ring-1 transition-all placeholder:text-[#1F2937] placeholder:opacity-50 font-inter resize-none ${stateCls(error)}`;

// Button that opens a CustomDropdown list.
export const selectButtonCls = ({ error = false, hasValue = false } = {}) =>
  `w-full border rounded-full px-3 h-[38px] text-[13px] text-left flex items-center justify-between transition-all bg-white font-inter disabled:bg-gray-50 disabled:text-gray-400 ${
    error ? "border-red-500" : "border-[#1F2937]/10"
  } ${hasValue ? "text-[#1F2937]" : "text-[#1F2937] opacity-50"}`;

// Country-code select beside a phone number.
export const PHONE_SELECT_CLS =
  "border border-[#1F2937]/10 rounded-full px-2 h-[38px] text-[13px] text-[#1F2937] bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all flex-shrink-0";

// Read-only box that looks like an input (file name display).
export const STATIC_FIELD_CLS =
  "flex items-center px-3 h-[38px] rounded-full border border-[#1F2937]/10 text-[13px] font-inter";

export const ACTION_BTN_BASE =
  "flex-shrink-0 h-[38px] rounded-full bg-[#158FFF] text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed";

// Gap between an input and its side button.
export const ACTION_ROW_CLS = "flex items-center gap-3";
