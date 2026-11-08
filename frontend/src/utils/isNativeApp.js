// True only inside the DataCircles mobile app (Expo WebView), which appends
// "DataCirclesApp" to the user agent. Plain browsers - desktop or a narrow
// window - are never treated as the app.
export const isNativeApp =
  typeof navigator !== "undefined" && /DataCirclesApp/i.test(navigator.userAgent);
