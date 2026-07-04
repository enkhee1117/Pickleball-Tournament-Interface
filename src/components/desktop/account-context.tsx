'use client';

import { createContext, useContext } from 'react';

/* Signed-in identity for the nav account menu. Fetched once in the root layout
   (getProfile is request-cached) and provided here so the client-side
   AccountMenu can read it from anywhere the nav renders — including the nav
   used inside client components — without threading props through every page. */

export type NavAccount = {
  name: string;
  handle: string;
  sub: string;
  avatarUrl: string | null;
};

const AccountContext = createContext<NavAccount | null>(null);

export function AccountProvider({
  account,
  children,
}: {
  account: NavAccount | null;
  children: React.ReactNode;
}) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

export function useAccount(): NavAccount | null {
  return useContext(AccountContext);
}
