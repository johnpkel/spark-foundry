import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ActivityLogProvider } from "@/components/ActivityLogProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Spark Foundry",
  description: "Collect, organize, and transform information into business artifacts for Contentstack DXP",
};

/**
 * Inline script that runs before first paint to prevent flash of wrong theme.
 * Reads localStorage, falls back to system preference, sets .dark on <html>.
 */
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('spark-theme');
    var dark = t === 'dark' || (!t || t === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ActivityLogProvider>
            {children}
          </ActivityLogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
