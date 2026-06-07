import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  StyleSheet,
  Platform,
  BackHandler,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from "react-native";
import { WebView } from "react-native-webview";
import { useEffect, useRef, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { useNetInfo } from "@react-native-community/netinfo";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { saveTokens, getAccessToken } from "../lib/storage/token-storage";
import { httpClient } from "../api/http-client";

// Keep the splash screen visible while we load the webview
SplashScreen.preventAutoHideAsync();

export function WebViewScreen() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showOfflineUI, setShowOfflineUI] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const netInfo = useNetInfo();
  const wasOfflineRef = useRef(false);
  const lastRegisteredRef = useRef<string | null>(null);
  const pendingNavigationPathRef = useRef<string | null>(null);
  const webBaseUrl = "https://huceautomart.com";

  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const onRefresh = () => {
    setRefreshing(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
    // Safety timeout in case onLoadEnd doesn't fire
    setTimeout(() => setRefreshing(false), 1500);
  };

  const toQueryString = (value: unknown): string => {
    if (!value || typeof value !== "object") return "";
    const params = new URLSearchParams();
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (typeof raw === "string") params.set(key, raw);
      if (typeof raw === "number" && Number.isFinite(raw)) params.set(key, String(raw));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const normalizeWebPath = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const parsed = new URL(trimmed);
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        return null;
      }
    }
    if (trimmed.startsWith("huceautos://")) {
      const parsed = Linking.parse(trimmed);
      const path = parsed.path ? `/${parsed.path.replace(/^\/+/, "")}` : "/";
      return `${path}${toQueryString(parsed.queryParams)}`;
    }
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  };

  const getTargetPathFromNotification = (
    response: Notifications.NotificationResponse,
  ): string | null => {
    const data = response.notification.request.content.data ?? {};
    const explicitPath = normalizeWebPath((data as any).path) ?? normalizeWebPath((data as any).url);
    if (explicitPath) return explicitPath;

    const entityType = typeof (data as any).entityType === "string" ? (data as any).entityType : null;
    const entityId = typeof (data as any).entityId === "number" ? (data as any).entityId : Number((data as any).entityId);
    const type = typeof (data as any).type === "string" ? (data as any).type : null;

    if (entityType === "conversation" && Number.isFinite(entityId)) {
      return `/buyer/messages?conversationId=${entityId}`;
    }
    if (entityType === "offer" && Number.isFinite(entityId)) {
      return `/buyer/offers/${entityId}`;
    }
    if (entityType === "listing" && Number.isFinite(entityId)) {
      return `/cars/${entityId}`;
    }
    if (type && type.includes("offer")) return "/buyer/offers";
    return "/notifications";
  };

  const navigateWebViewToPath = (path: string) => {
    const safePath = normalizeWebPath(path);
    if (!safePath) return;
    pendingNavigationPathRef.current = safePath;
    const injectedJs = `
      (function() {
        try {
          window.location.href = '${safePath.replace(/'/g, "\\'")}';
        } catch (e) {}
        true;
      })();
    `;
    webViewRef.current?.injectJavaScript(injectedJs);
  };

  const readWebTokenScript = `
    (function() {
      try {
        var token = window.localStorage.getItem("token");
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "auth_token", token: token })
        );
      } catch (e) {}
      true;
    })();
  `;

  const registerForPushNotificationsAsync = async (): Promise<string | null> => {
    if (!Device.isDevice) return null;
    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    if (finalStatus !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }
    if (finalStatus !== "granted") return null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  };

  const registerPushTokenToBackend = async (authToken?: string | null) => {
    const bearer = authToken ?? (await getAccessToken());
    if (!bearer || !expoPushToken) return;

    const uniqueKey = `${bearer}:${expoPushToken}`;
    if (lastRegisteredRef.current === uniqueKey) return;

    await httpClient.post("/notifications/push-token", {
      expoPushToken,
      platform: Platform.OS === "ios" ? "ios" : "android",
      appVersion: Constants.expoConfig?.version ?? "1.0.0",
      deviceId: `${Platform.OS}-${Device.modelName ?? "device"}`,
    });
    lastRegisteredRef.current = uniqueKey;
  };

  const handleAuthToken = async (token: string) => {
    await saveTokens(token);
    try {
      await registerPushTokenToBackend(token);
    } catch (error) {
      console.warn("Push token registration failed:", error);
    }
  };

  useEffect(() => {
    registerForPushNotificationsAsync()
      .then(setExpoPushToken)
      .catch((error) => console.warn("Push permission/token setup failed:", error));
  }, []);

  useEffect(() => {
    if (!expoPushToken) return;
    registerPushTokenToBackend().catch((error) =>
      console.warn("Push token sync skipped:", error),
    );
  }, [expoPushToken]);

  useEffect(() => {
    const consumeNotificationResponse = (response: Notifications.NotificationResponse) => {
      const targetPath = getTargetPathFromNotification(response);
      if (!targetPath) return;
      navigateWebViewToPath(targetPath);
    };

    const responseSub = Notifications.addNotificationResponseReceivedListener(
      consumeNotificationResponse,
    );

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) consumeNotificationResponse(response);
      })
      .catch((error) => console.warn("Notification response restore failed:", error));

    return () => {
      responseSub.remove();
    };
  }, []);

  // Listen for deep links returning from the WebBrowser
  useEffect(() => {
    const handleDeepLink = (event: Linking.EventType) => {
      const url = event.url;
      // When the backend redirects back to the app, close the external browser
      if (url) {
        WebBrowser.dismissBrowser();
        
        // Extract the query parameters from the deep link
        const parsed = Linking.parse(url);
        const token = parsed.queryParams?.token;
        const error = parsed.queryParams?.error;
        const onboardingToken = parsed.queryParams?.onboardingToken;

        if ((token || error || onboardingToken) && webViewRef.current) {
          // Construct the query string
          const queryParts = [];
          if (token) queryParts.push(`token=${token}`);
          if (error) queryParts.push(`error=${error}`);
          if (onboardingToken) queryParts.push(`onboardingToken=${onboardingToken}`);
          
          const queryString = queryParts.join('&');
          
          // Execute the redirect inside the WebView silently
          const injectedJs = `
            window.location.replace('/sign-in?${queryString}');
            true;
          `;
          
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(injectedJs);
          }, 500);
          if (typeof token === "string" && token.length > 0) {
            handleAuthToken(token).catch(() => {});
          }
        } else if (webViewRef.current) {
          // Handle standard deep linking paths (Android App Links / iOS Universal Links)
          const targetPath = normalizeWebPath(url);
          if (targetPath && targetPath !== '/') {
            navigateWebViewToPath(targetPath);
          } else {
            webViewRef.current.reload();
          }
        }
      }
    };

    const subscription = Linking.addEventListener("url", handleDeepLink);
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (isOffline) {
      timer = setTimeout(() => {
        setShowOfflineUI(true);
        wasOfflineRef.current = true;
        SplashScreen.hideAsync();
      }, 800);
    } else {
      setShowOfflineUI(false);

      // Reload once when internet comes back to avoid stale states in the webview.
      if (wasOfflineRef.current && webViewRef.current) {
        wasOfflineRef.current = false;
        webViewRef.current.reload();
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isOffline]);

  useEffect(() => {
    const onBackPress = () => {
      if (showOfflineUI) return false;
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // Prevent default behavior (exiting app)
      }
      return false; // Default behavior (exit app if at the root)
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", onBackPress);

    return () => {
      backHandler.remove();
    };
  }, [canGoBack, showOfflineUI]);

  // Intercept Google Auth URLs and open them in the native browser
  const handleShouldStartLoadWithRequest = (request: any) => {
    const url = request.url;
    // Intercept Google OAuth initialization
    if (url.includes("/api/auth/google") && !url.includes("callback")) {
      
      // We pass our app's deep link to the backend via a query parameter
      // so the backend knows where to redirect after successful login
      const returnUrl = Linking.createURL("oauthredirect");
      
      // Open the system browser as a graceful overlay popup
      WebBrowser.openBrowserAsync(`${url}?returnTo=${encodeURIComponent(returnUrl)}`, {
        presentationStyle: (WebBrowser as any).WebBrowserPresentationStyle?.FORM_SHEET || 2,
        dismissButtonStyle: (WebBrowser as any).WebBrowserDismissButtonStyle?.CLOSE || 'close',
      });
      
      return false; // Stop the WebView from loading it
    }
    return true; // Allow the WebView to load normally
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {showOfflineUI ? (
        <View style={styles.offlineContainer}>
          <View style={styles.offlineCard}>
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineBadgeText}>No connection</Text>
            </View>
            <Text style={styles.offlineTitle}>You are offline</Text>
            <Text style={styles.offlineDescription}>
              Please check your internet connection and try again.
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.retryButton}
              onPress={() => {
                setShowOfflineUI(false);
                onRefresh();
              }}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
      <View style={{ flex: 1 }}>
        <WebView
          ref={webViewRef}
          source={{ uri: webBaseUrl }} // Ensure it hits the production or local frontend URL
          onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
          onMessage={(event) => {
            try {
              const payload = JSON.parse(event.nativeEvent.data);
              if (payload?.type === "auth_token" && typeof payload.token === "string" && payload.token.length > 0) {
                handleAuthToken(payload.token).catch(() => {});
              }
            } catch {
              // Ignore non-JSON webview messages
            }
          }}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          onLoadEnd={() => {
            setRefreshing(false);
            webViewRef.current?.injectJavaScript(readWebTokenScript);
            if (pendingNavigationPathRef.current) {
              navigateWebViewToPath(pendingNavigationPathRef.current);
              pendingNavigationPathRef.current = null;
            }
            // Hide the splash screen after a delay to ensure React has fully hydrated in the WebView
            setTimeout(() => {
              SplashScreen.hideAsync();
            }, 3000);
          }}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#ffffff" />
            </View>
          )}
          pullToRefreshEnabled={false} // Disabled because it requires bounces={true} which causes elastic scrolling
          bounces={false} // Disable iOS elastic bounce
          overScrollMode="never" // Disable Android elastic overscroll glow/bounce
          allowsBackForwardNavigationGestures
          sharedCookiesEnabled
          javaScriptEnabled
        />
      </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#195A32", // Match brand color for SafeArea (top/bottom bars)
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#195A32",
  },
  offlineContainer: {
    flex: 1,
    backgroundColor: "#195A32",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  offlineCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
  },
  offlineBadge: {
    backgroundColor: "#EBF1ED",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  offlineBadgeText: {
    color: "#154A29",
    fontSize: 12,
    fontWeight: "700",
  },
  offlineTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#171F26",
    marginBottom: 10,
    textAlign: "center",
  },
  offlineDescription: {
    color: "#677F71",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#195A32",
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 30,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
