import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "Devon ZIP Loader — Preview Deployment",
  description: "Prepare a Devon source ZIP for a server-backed custom preview deployment.",
}

export const viewport: Viewport = {
  themeColor: "#080b12",
  colorScheme: "dark",
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
