import "./globals.css";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://clinicas.nexawi.com.br"
  ),
  title: "NexaWi Clínicas",
  description: "Sistema de gestão para clínicas.",

  verification: {
    other: {
      "facebook-domain-verification":
        "7m6txqftpr4f5j4189m9y7wujvm2hd",
    },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
