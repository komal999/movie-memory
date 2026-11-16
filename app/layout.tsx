import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movie Memory",
  description: "Remember your favorite movie and learn something new about it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
