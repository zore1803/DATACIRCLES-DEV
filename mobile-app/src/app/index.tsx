import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView as RNWebView } from 'react-native-webview';

// react-native-webview@14 platform-prop intersection collapses to `never` under RN 0.88 types.
const WebView = RNWebView as unknown as React.ComponentType<any> & { prototype: { goBack(): void } };

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://portal.datacircles.in';

export default function Home() {
  const ref = useRef<{ goBack(): void }>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  // Android hardware back button navigates inside the web app first.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        ref.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <WebView
        ref={ref}
        source={{ uri: WEB_URL }}
        style={styles.web}
        onNavigationStateChange={(s: { canGoBack: boolean }) => setCanGoBack(s.canGoBack)}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator size="large" />
          </View>
        )}
        domStorageEnabled
        javaScriptEnabled
        sharedCookiesEnabled
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  web: { flex: 1 },
  loader: { ...(StyleSheet.absoluteFill as object), alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
