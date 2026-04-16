import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
});

const jetMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "Air GTM · Lead Pipeline",
  description: "Ingest, enrich, score, and export leads for Salesforce",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetMono.variable} dark`}
    >
      <body suppressHydrationWarning className="antialiased">
        {children}
      </body>
    </html>
  );
}
