import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// import HeaderUserMenu from "@/components/HeaderUserMenu";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen flex flex-col">
          {/* Top Navigation Bar */}
          <header className="h-14 bg-white border-b border-venus-gray-200 flex items-center px-6 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-venus-purple flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold text-venus-gray-700">Spark Foundry</h1>
            </div>
            <div className="ml-auto flex items-center gap-4">
              {/* TODO: Re-enable when Contentstack OAuth is ready */}
              {/* <HeaderUserMenu /> */}
              <span className="text-sm text-venus-gray-500">for Contentstack DXP</span>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
