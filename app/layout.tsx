import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { ConditionalAppHeader } from "@/components/layout/ConditionalAppHeader";
import { SessionCookieSync } from "@/components/layout/SessionCookieSync";
import { Outfit, Source_Sans_3 } from "next/font/google";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WhatsApp Tracking – Atribuição CTWA",
  description: "Atribuição de campanhas Click to WhatsApp (Meta)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${outfit.variable} ${sourceSans.variable} font-sans antialiased`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var k="whatsapp-tracking-theme";var t=localStorage.getItem(k);var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var v=t&&(t==="dark"||t==="light")?t:(d?"dark":"light");document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(v);})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <SessionCookieSync />
          <ConditionalAppHeader />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
