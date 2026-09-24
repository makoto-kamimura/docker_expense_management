import { requireUser } from '@/lib/session';
import Onboarding from './onboarding';

export default async function OnboardingPage() {
  const user = await requireUser();
  return <Onboarding name={user.name} familyName={user.family.name} />;
}
