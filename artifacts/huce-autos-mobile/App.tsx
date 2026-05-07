import "./global.css";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { AppProviders } from "./src/app-providers";
import { RootNavigator } from "./src/navigation/root-navigator";

// Set Android bottom navigation bar color to brand green
SystemUI.setBackgroundColorAsync("#195A32");

export default function App() {
  return (
    <AppProviders>
      {/* Set top status bar color to brand green, with light text */}
      <StatusBar style="light" backgroundColor="#195A32" />
      <RootNavigator />
    </AppProviders>
  );
}
