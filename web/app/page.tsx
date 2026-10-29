import { HomePage } from "@/components/home/home-page";
import { loadHomeContent } from "@/lib/home-content";

export const revalidate = 300;

export default async function Page() {
  return <HomePage content={await loadHomeContent()} />;
}
