import "./globals.css";

export const metadata = {
  title: "NFPA 13 / 13R RAG Chat",
  description: "Ask compliance questions with strict citations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased bg-neutral-950 text-neutral-200">
        {children}
      </body>
    </html>
  );
}
