import React, { createContext, useContext, useState, useEffect } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeType = "dark" | "light";

interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeType>("light");

  useEffect(() => {
    AsyncStorage.getItem("@app_theme").then((val) => {
      if (val === "dark" || val === "light") {
        setThemeState(val);
      } else {
        // Fallback to light by default
        setThemeState("light");
      }
    });
  }, [systemScheme]);

  const setTheme = async (newTheme: ThemeType) => {
    setThemeState(newTheme);
    try {
      await AsyncStorage.setItem("@app_theme", newTheme);
    } catch (e) {
      console.warn("⚠️ Failed to persist theme preference to AsyncStorage:", e);
    }
  };

  const isDark = theme === "dark";

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return { theme: "dark" as const, setTheme: () => {}, isDark: true };
  }
  return context;
}
