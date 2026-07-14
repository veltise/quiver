import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Quiver",
  description: "Build, fire, and share HTTP requests.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased bg-gray-950`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <div className="h-px shrink-0 bg-gradient-to-r from-transparent via-indigo-500/70 to-transparent" />
        {children}
      </body>
    </html>
  );
}
