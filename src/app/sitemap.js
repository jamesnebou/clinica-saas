export default function sitemap() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://clinicas.nexawi.com.br").replace(/\/$/, "");
  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/estetica`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/privacidade`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/termos`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
