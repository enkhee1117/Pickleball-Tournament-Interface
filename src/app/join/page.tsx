import { JoinForm } from './JoinForm';

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const sp = await searchParams;
  return <JoinForm initialCode={sp.code ?? ''} />;
}
