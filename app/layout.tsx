import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { AppHeader } from "@/components/layout/AppHeader";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="pt-BR" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var k="whatsapp-tracking-theme";var t=localStorage.getItem(k);var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var v=t&&(t==="dark"||t==="light")?t:(d?"dark":"light");document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(v);})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <AppHeader />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
