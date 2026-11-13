import { Landing } from "@/components/Landing";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  return <Landing notice={params.notice} />;
}
