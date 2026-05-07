import { SafeAreaView } from "react-native-safe-area-context";
import { View, StyleSheet, Platform, BackHandler, ActivityIndicator, ScrollView, RefreshControl } from "react-native";
import { WebView } from "react-native-webview";
import { useEffect, useRef, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";

// Keep the splash screen visible while we load the webview
SplashScreen.preventAutoHideAsync();

export function WebViewScreen() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
    // Safety timeout in case onLoadEnd doesn't fire
    setTimeout(() => setRefreshing(false), 1500);
  };

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
        } else if (webViewRef.current) {
          webViewRef.current.reload();
        }
      }
    };

    const subscription = Linking.addEventListener("url", handleDeepLink);
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const onBackPress = () => {
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
  }, [canGoBack]);

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
      <ScrollView
        contentContainerStyle={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["hsl(143 60% 26%)"]} // Android spinner color (Primary)
            tintColor="hsl(143 60% 26%)" // iOS spinner color (Primary)
          />
        }
      >
        <WebView
          ref={webViewRef}
          source={{ uri: "https://huceautomart.com" }} // Ensure it hits the production or local frontend URL
          onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          onLoadEnd={() => {
            setRefreshing(false);
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
          pullToRefreshEnabled={Platform.OS === 'ios'} // iOS handles this natively very well, Android uses the ScrollView wrapper
          bounces={true}
          allowsBackForwardNavigationGestures
          sharedCookiesEnabled
          javaScriptEnabled
        />
      </ScrollView>
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
});