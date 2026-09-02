import { Hero } from "@/components/hero";
import { activeNetworkId } from "@/lib/stellar/networks";

export default function Home() {
  return <Hero network={activeNetworkId()} />;
}
