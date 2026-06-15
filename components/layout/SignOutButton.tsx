'use client'
import { signOut } from 'next-auth/react'

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
    >
      Salir
    </button>
  )
}
