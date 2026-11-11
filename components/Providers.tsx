'use client'
import { SessionProvider } from 'next-auth/react'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import type { Session } from 'next-auth'

export default function Providers({ children, session }: { children: React.ReactNode; session?: Session }) {
  return (
    <SessionProvider session={session}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </SessionProvider>
  )
}
