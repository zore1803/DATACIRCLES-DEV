// Design-token layer for form theming.
//
// A theme is NOT a stylesheet — it's a flat set of tokens that the Builder canvas, the Preview and
// the public page all consume identically, by way of CSS custom properties. Adding a preset means
// adding a token block here; it never means writing new CSS.
//
// Resolution model — deliberately NOT a separate `theme.overrides` object:
//
//     THEME_PRESETS[theme.preset]        (the baseline look)
//              +
//     any field explicitly set on `theme`  (the user's customisations)
//              ↓
//        resolved tokens  ->  CSS variables  ->  rendered form
//
// The flat fields that already existed on themeSchema (fontFamily, textColor, buttonColor, ...) ARE
// the override layer, so every form created before presets existed keeps rendering exactly as it
// did: with no `preset` set it falls back to `minimal`, and its own stored fields still win.
// "Reset" in the Builder writes "" — treated as unset, so the token falls back to the preset.
//
// This lives on the frontend only: theme is presentation-only and is served live from
// FormDefinition (never frozen into FormVersion), so a theme edit takes effect without republishing
// and there is no second copy of this table on the server to drift out of sync.

// Column layout: elements are a flat list, each declaring how much of a 2-column grid it takes.
// Wrap a form's elements in `FORM_GRID_CLASS` and give each one `columnSpanClass(el)`.
export const FORM_GRID_CLASS = "grid grid-cols-2 gap-x-4 gap-y-3 items-start";
export function columnSpanClass(element) {
  // Only fields and images are sensible half-width; a divider or the submit-button row spanning
  // half the form is almost always a mistake, so they stay full width regardless.
  const halvable = element?.type === "field" || element?.type === "image";
  return element?.layoutWidth === "half" && halvable ? "col-span-1 min-w-0" : "col-span-2 min-w-0";
}

export const FONT_OPTIONS = ["Inter", "Arial", "Georgia", "Times New Roman", "Courier New", "Verdana"];

// Real stacks with fallbacks — a bare `Times New Roman` is invalid unquoted, and every choice needs
// a generic fallback for machines lacking the face.
export const FONT_STACKS = {
  Inter: "'Inter', sans-serif",
  Arial: "Arial, Helvetica, sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  "Times New Roman": "'Times New Roman', Times, serif",
  "Courier New": "'Courier New', Courier, monospace",
  Verdana: "Verdana, Geneva, sans-serif",
};

const BASE = {
  fontFamily: "Inter",
  fontSize: "normal",
  fontWeight: "normal",
  textAlign: "left",
  formMaxWidth: 640,
  formPadding: 32,
  formRadius: 12,
  formShadow: "sm",
  inputStyle: "outlined", // outlined | filled | underline
  inputRadius: 999, // fully rounded pill, matching the rest of the redesigned form-builder chrome
  buttonRadius: 8,
  buttonWidth: "auto", // auto | full
  buttonPosition: "left",
  buttonStyle: "solid", // solid | outline
  buttonTextColor: "#FFFFFF",
};

export const THEME_PRESETS = {
  minimal: {
    label: "Minimal",
    tokens: {
      ...BASE,
      primaryColor: "#111827", backgroundColor: "#FFFFFF", surfaceColor: "#FFFFFF",
      textColor: "#111827", mutedTextColor: "#6B7280", borderColor: "#E5E7EB",
      buttonColor: "#0085FF", formRadius: 8, inputRadius: 999, buttonRadius: 999, formShadow: "none",
    },
  },
  professional: {
    label: "Professional",
    tokens: {
      ...BASE,
      primaryColor: "#2563EB", backgroundColor: "#F8FAFC", surfaceColor: "#FFFFFF",
      textColor: "#0F172A", mutedTextColor: "#64748B", borderColor: "#E2E8F0",
      buttonColor: "#2563EB",
    },
  },
  modern: {
    label: "Modern",
    tokens: {
      ...BASE,
      primaryColor: "#7C3AED", backgroundColor: "#FAF5FF", surfaceColor: "#FFFFFF",
      textColor: "#1E1B4B", mutedTextColor: "#6D28D9", borderColor: "#E9D5FF",
      buttonColor: "#7C3AED", formRadius: 20, inputRadius: 12, buttonRadius: 999,
      formShadow: "lg", inputStyle: "filled",
    },
  },
  corporate: {
    label: "Corporate",
    tokens: {
      ...BASE,
      primaryColor: "#1D4ED8", backgroundColor: "#F1F5F9", surfaceColor: "#FFFFFF",
      textColor: "#0F172A", mutedTextColor: "#475569", borderColor: "#CBD5E1",
      buttonColor: "#1D4ED8", formMaxWidth: 720, formPadding: 40,
      formRadius: 4, inputRadius: 4, buttonRadius: 4, formShadow: "none",
    },
  },
  dark: {
    label: "Dark",
    tokens: {
      ...BASE,
      primaryColor: "#3B82F6", backgroundColor: "#0B1120", surfaceColor: "#111827",
      textColor: "#F9FAFB", mutedTextColor: "#9CA3AF", borderColor: "#374151",
      buttonColor: "#3B82F6", formRadius: 14, inputRadius: 8, inputStyle: "filled", formShadow: "lg",
    },
  },
  soft: {
    label: "Soft",
    tokens: {
      ...BASE,
      primaryColor: "#F97316", backgroundColor: "#FFF7ED", surfaceColor: "#FFFBF7",
      textColor: "#431407", mutedTextColor: "#9A6B4F", borderColor: "#FED7AA",
      buttonColor: "#F97316", formRadius: 24, inputRadius: 14, buttonRadius: 999,
      formPadding: 36, formShadow: "md", inputStyle: "filled",
    },
  },
};

export const PRESET_KEYS = Object.keys(THEME_PRESETS);
export const DEFAULT_PRESET = "minimal";

// Only these keys participate in token resolution. Anything else stored on `theme` (logoUrl,
// backgroundImageUrl, preset itself...) is passed through untouched but is not a style token.
const TOKEN_KEYS = Object.keys(THEME_PRESETS.minimal.tokens);

/**
 * Merge a stored theme document over its preset's tokens.
 * Inputs: theme (FormDefinition.theme, may be undefined/partial/legacy)
 * Outputs: a complete token object — every TOKEN_KEY guaranteed present.
 */
export function resolveTheme(theme) {
  const preset = THEME_PRESETS[theme?.preset] || THEME_PRESETS[DEFAULT_PRESET];
  const resolved = { ...preset.tokens };
  for (const key of TOKEN_KEYS) {
    const v = theme?.[key];
    // "" is how the Builder's Reset clears an override — treat it as unset so the preset shows
    // through, rather than as a real (empty) value.
    if (v !== undefined && v !== null && v !== "") resolved[key] = v;
  }
  return resolved;
}

const SHADOWS = {
  none: "none",
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 12px -2px rgb(0 0 0 / 0.10)",
  lg: "0 20px 40px -12px rgb(0 0 0 / 0.20)",
};

// Filled/underline inputs need a surface distinct from the card behind them; deriving it from the
// text colour keeps it correct on light AND dark presets without a separate token.
function inputSurface(t) {
  if (t.inputStyle !== "filled") return "transparent";
  return isDark(t.surfaceColor) ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
}

function isDark(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ""));
  if (!m) return false;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/**
 * Turn resolved tokens into the CSS custom properties the .form-theme-scope rules consume.
 * Applied as an inline `style` on the form surface — see index.css for how they're used, and why
 * the font in particular MUST travel as a variable rather than as `fontFamily`.
 */
export function themeCssVars(theme) {
  const t = resolveTheme(theme);
  return {
    "--form-font": FONT_STACKS[t.fontFamily] || FONT_STACKS.Inter,
    "--form-primary": t.primaryColor,
    "--form-bg": t.backgroundColor,
    "--form-surface": t.surfaceColor,
    "--form-text": t.textColor,
    "--form-muted": t.mutedTextColor,
    "--form-border": t.borderColor,
    "--form-radius": `${t.formRadius}px`,
    "--form-padding": `${t.formPadding}px`,
    "--form-max-width": `${t.formMaxWidth}px`,
    "--form-shadow": SHADOWS[t.formShadow] || SHADOWS.sm,
    "--form-input-radius": `${t.inputStyle === "underline" ? 0 : t.inputRadius}px`,
    "--form-input-bg": inputSurface(t),
    "--form-input-border-width": t.inputStyle === "underline" ? "0 0 1px 0" : "1px",
    "--form-button-bg": t.buttonColor,
    "--form-button-text": t.buttonTextColor,
    "--form-button-radius": `${t.buttonRadius}px`,
  };
}
