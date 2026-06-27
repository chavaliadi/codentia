import type { Metadata } from "next";
import "./globals.css";
import { Outfit } from 'next/font/google';
import { ConvexClientProvider } from '@/app/ConvexClientProvider';
import { ClerkProvider } from '@clerk/nextjs'
import Provider from "./provider";

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '700'] });

export const metadata: Metadata = {
  title: "Codentia",
  description: "An explainable code intelligence platform combining deterministic static analysis with AI-guided reasoning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
    <html lang="en">
      <body
       className={outfit.className}
       >
        <ConvexClientProvider>
          <Provider>
            {children}
            </Provider>
            </ConvexClientProvider>
      </body>
    </html>
    </ClerkProvider>
  );
}
