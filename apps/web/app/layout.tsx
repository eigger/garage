import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";
import { SettingsProvider } from "../lib/i18n/settings-context";
import { AuthProvider } from "../lib/auth-context";
import { ToastProvider } from "../lib/toast-context";
import { ConfirmProvider } from "../lib/confirm-context";

export const metadata: Metadata = {
  title: "Garage",
  description: "차량관리 통합 대시보드",
  appleWebApp: {
    capable: true,
    title: "Garage",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#18523f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <RegisterServiceWorker />
        <SettingsProvider>
          <ToastProvider>
            <ConfirmProvider>
              <AuthProvider>{children}</AuthProvider>
            </ConfirmProvider>
          </ToastProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
