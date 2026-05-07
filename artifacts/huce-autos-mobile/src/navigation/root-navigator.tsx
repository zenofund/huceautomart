import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebViewScreen } from "../screens/webview-screen";
import { OnboardingScreen } from "../screens/onboarding-screen";

type AppStackParamList = {
  Onboarding: undefined;
  WebView: undefined;
};

const AppStack = createNativeStackNavigator<AppStackParamList>();

export function RootNavigator() {
  const [initialRoute, setInitialRoute] = useState<keyof AppStackParamList | null>(null);

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const hasSeen = await AsyncStorage.getItem("hasSeenOnboarding");
        if (hasSeen === "true") {
          setInitialRoute("WebView");
        } else {
          setInitialRoute("Onboarding");
        }
      } catch (error) {
        console.error("Error reading onboarding status:", error);
        setInitialRoute("Onboarding");
      }
    }
    checkOnboarding();
  }, []);

  if (!initialRoute) return null; // Still loading AsyncStorage

  return (
    <AppStack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false, animation: "fade" }}>
      <AppStack.Screen name="Onboarding" component={OnboardingScreen} />
      <AppStack.Screen name="WebView" component={WebViewScreen} />
    </AppStack.Navigator>
  );
}
