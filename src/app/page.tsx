import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function Home() {
  redirect('/skeniraj')
}